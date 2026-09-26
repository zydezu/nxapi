import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fetch } from 'undici';
import createDebug from '../util/debug.js';
import { dir, docker, version } from '../util/product.js';
import { paths } from '../util/storage.js';
import { timeoutSignal } from '../util/misc.js';

const debug = createDebug('nxapi:update');

const RELEASES_URL = 'https://api.github.com/repos/zydezu/nxapi/releases';

export async function checkUpdates() {
    if (docker) {
        debug('Running in Docker container, skipping update check');
        return null;
    }

    try {
        if (!process.versions.electron) {
            await fs.stat(path.join(dir, '.git'));

            debug('git repository exists, skipping update check');
            return null;
        }
    } catch (err) {}

    await fs.mkdir(paths.cache, {recursive: true});
    const update_cache_path = path.resolve(paths.cache, 'update.json');

    try {
        const data: UpdateCacheData = JSON.parse(await fs.readFile(update_cache_path, 'utf-8'));

        if (data && data.current_version === version && data.expires_at > Date.now() &&
            (!('releases_url' in data) || data.releases_url === RELEASES_URL)
        ) {
            if ('update_available' in data && data.update_available) {
                console.warn('[nxapi] Update available - current version %s, latest %s',
                    data.current_version, data.latest_version);
            }

            return data;
        }
    } catch (err) {}

    debug('Checking for updates');

    try {
        const [signal, cancel] = timeoutSignal();
        const response = await fetch(RELEASES_URL, {signal}).finally(cancel);
        if (!response.ok) throw new Error('GitHub API returned ' + response.status + ' ' + response.statusText);
        const releases = (await response.json() as Release[])
            .filter(r => !r.draft && /^v?\d+\.\d+\.\d+/.test(r.tag_name));

        const current = releases.find(r => r.tag_name === 'v' + version);
        const latest: Release | undefined = releases.find(r => !r.prerelease || current?.prerelease) ?? releases[0];
        const latest_version = latest?.tag_name.replace(/^v/, '') ?? version;

        const data: UpdateCacheDataSuccess = {
            created_at: Date.now(),
            expires_at: Date.now() + 86400000, // 24 hours
            releases,
            releases_url: RELEASES_URL,
            current,
            current_version: version,
            latest,
            latest_version,
            update_available: compareVersions(latest_version, version) > 0,
        };

        await fs.writeFile(update_cache_path, JSON.stringify(data, null, 4) + '\n');

        if (data.update_available) {
            console.warn('[nxapi] Update available - current version %s, latest %s', version, latest_version);
        } else {
            debug('Using latest %s version %s', latest?.prerelease ? 'prerelease' : 'stable', latest_version);
        }

        debug('Next update check at %s', new Date(data.expires_at));

        return data;
    } catch (err) {
        console.warn('[nxapi] Update check failed', err);

        const data: UpdateCacheDataFailed = {
            created_at: Date.now(),
            expires_at: Date.now() + 1800000, // 30 minutes
            current_version: version,
            error_message: (err as Error).message,
        };

        await fs.writeFile(update_cache_path, JSON.stringify(data, null, 4) + '\n');

        return data;
    }
}

function compareVersions(a: string, b: string) {
    const [a_main, a_pre] = a.split('-', 2);
    const [b_main, b_pre] = b.split('-', 2);
    const a_parts = a_main.split('.').map(n => parseInt(n) || 0);
    const b_parts = b_main.split('.').map(n => parseInt(n) || 0);

    for (let i = 0; i < Math.max(a_parts.length, b_parts.length); i++) {
        const diff = (a_parts[i] ?? 0) - (b_parts[i] ?? 0);
        if (diff) return diff;
    }

    // A release is newer than a prerelease of the same version
    if (!a_pre !== !b_pre) return a_pre ? -1 : 1;
    return (a_pre ?? '').localeCompare(b_pre ?? '');
}

export type UpdateCacheData = UpdateCacheDataSuccess | UpdateCacheDataFailed;

export interface UpdateCacheDataSuccess {
    created_at: number;
    expires_at: number;
    releases: Release[];
    releases_url: string;
    current: Release | undefined;
    current_version: string;
    latest: Release | undefined;
    latest_version: string;
    update_available: boolean;
}

export interface UpdateCacheDataFailed {
    created_at: number;
    expires_at: number;
    current_version: string;
    error_message: string;
}

interface Release {
    url: string;
    assets_url: string;
    upload_url: string;
    html_url: string;
    id: number;
    author: ReleaseAuthor;
    node_id: string;
    tag_name: string;
    target_commitish: string;
    name: string;
    draft: boolean;
    prerelease: boolean;
    created_at: string;
    published_at: string;
    assets: unknown[];
    tarball_url: string;
    zipball_url: string;
    body: string;
}
interface ReleaseAuthor {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: 'User';
    site_admin: boolean;
}
