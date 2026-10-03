/**
 * Display name of the app, used as the leading segment of every window title.
 */
export const APP_TITLE = 'nxapi';

export function formatWindowTitle(page?: string | null, app_title?: string | null) {
    const app = app_title || APP_TITLE;
    return page ? app + ' - ' + page : app;
}