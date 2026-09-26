import { app, BrowserWindow, clipboard, dialog, nativeImage } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fetch } from 'undici';
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

export async function copyAlbumImage(item: Media) {
    if (item.type !== MediaType.IMAGE) throw new Error('Only images can be copied');

    const image = nativeImage.createFromBuffer(await downloadAlbumItem(item));
    if (image.isEmpty()) throw new Error('Failed to decode album image');

    clipboard.writeImage(image);
}
