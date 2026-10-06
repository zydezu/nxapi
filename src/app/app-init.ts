import { app } from 'electron';
import { join } from 'node:path';
import process from 'node:process';
import { init as initDebug } from '../util/debug.js';
import { paths } from '../util/product.js';

// kill passkeys (windows only)
if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-features', 'WebAuthenticationUseNativeWinApi');
}

await initDebug(join(paths.log, 'app'));
