import { app, BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, WebContents } from 'electron';
import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import * as util from 'node:util';
import { fetch } from 'undici';
import { ZipFile } from 'yazl';
import { Media, MediaType } from '../../api/coral-types.js';
import createDebug from '../../util/debug.js';

const debug = createDebug('app:main:album');

export function getAlbumItemFilename(item: Media) {
    const date = new Date(item.capturedAt * 1000).toISOString()
        .replace(/\.\d+Z$/, '').replace('T', ' ').replace(/:/g, '-');
    const name = (item.appName || 'Nintendo Switch 2').replace(/[\\/:*?"<>|]/g, '').trim();

    return name + ' ' + date + (item.type === MediaType.VIDEO ? '.mp4' : '.jpg');
}

async function downloadAlbumItem(item: Media) {
    const response = await fetch(item.contentUri);
    if (!response.ok) throw new Error('Failed to download album item: ' + response.status + ' ' + response.statusText);

    return Buffer.from(await response.arrayBuffer());
}

export async function saveAlbumItem(item: Media, window?: BrowserWindow) {
    const directory = app.getPath(item.type === MediaType.VIDEO ? 'videos' : 'pictures');
    const options = {
        defaultPath: path.join(directory, getAlbumItemFilename(item)),
        filters: item.type === MediaType.VIDEO ?
            [{name: 'Video', extensions: ['mp4']}] :
            [{name: 'Image', extensions: ['jpg', 'jpeg']}],
    };

    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

    debug('Saving album item %s to %s', item.id, result.filePath);

    await fs.writeFile(result.filePath, await downloadAlbumItem(item));

    return result.filePath;
}

export interface AlbumZipProgress {
    done: number;
    total: number;
}

export async function saveAlbumZip(items: Media[], sender: WebContents, window?: BrowserWindow) {
    const options = {
        defaultPath: path.join(app.getPath('downloads'),
            'Nintendo Switch 2 Album ' + new Date().toISOString().slice(0, 10) + '.zip'),
        filters: [{name: 'Zip archive', extensions: ['zip']}],
    };

    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

    const zip = new ZipFile();
    const used_names = new Set<string>();
    let done = 0;

    const sendProgress = () => sender.isDestroyed() ||
        sender.send('nxapi:album:zip-progress', {done, total: items.length} satisfies AlbumZipProgress);

    for (const item of items) {
        let name = getAlbumItemFilename(item);
        for (let i = 2; used_names.has(name); i++) {
            name = getAlbumItemFilename(item).replace(/(\.\w+)$/, ' (' + i + ')$1');
        }
        used_names.add(name);

        // Captures are already compressed, and fetching lazily downloads one item at a time
        zip.addReadStreamLazy(name, {compress: false, mtime: new Date(item.capturedAt * 1000)}, cb => {
            fetch(item.contentUri).then(response => {
                if (!response.ok || !response.body) {
                    throw new Error('Failed to download ' + name + ': ' + response.status + ' ' + response.statusText);
                }

                const stream = Readable.fromWeb(response.body as WebReadableStream);
                stream.on('end', () => (done++, sendProgress()));
                cb(null, stream);
            }).catch(err => cb(err, null!));
        });
    }

    debug('Saving %d album items to %s', items.length, result.filePath);
    sendProgress();
    zip.end();

    const temp_path = result.filePath + '.part';

    try {
        await pipeline(zip.outputStream, createWriteStream(temp_path));
        await fs.rename(temp_path, result.filePath);
    } catch (err) {
        await fs.rm(temp_path, {force: true});
        throw err;
    }

    return result.filePath;
}

const execFile = util.promisify(child_process.execFile);

export async function copyAlbumItem(item: Media) {
    if (item.type === MediaType.IMAGE) return copyAlbumImage(item);

    // Videos are copied as a file so pasting into Discord or a file manager uses the file itself
    const directory = path.join(os.tmpdir(), 'nxapi-album');
    await fs.mkdir(directory, {recursive: true});
    const file = path.join(directory, getAlbumItemFilename(item));

    try {
        await fs.stat(file);
    } catch (err) {
        await fs.writeFile(file + '.part', await downloadAlbumItem(item));
        await fs.rename(file + '.part', file);
    }

    await copyFile(file);
}

async function copyFile(file: string) {
    if (process.platform === 'win32') {
        await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
            'Set-Clipboard -LiteralPath \'' + file.replace(/'/g, "''") + '\'']);
        return;
    }

    const url = pathToFileURL(file).href;

    await clipboard.write([new ClipboardItem(process.platform === 'darwin' ? {
        'electron application/osclipboard;format="public.file-url"': url,
    } : {
        'text/uri-list': url + '\r\n',
    })]);
}

async function copyAlbumImage(item: Media) {
    const image = nativeImage.createFromBuffer(await downloadAlbumItem(item));
    if (image.isEmpty()) throw new Error('Failed to decode album image');

    const png = image.toPNG();
    await clipboard.write([new ClipboardItem({'image/png': new Blob([new Uint8Array(png)], {type: 'image/png'})})]);
}
