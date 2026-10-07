import { AppRegistry } from 'react-native';
import { HIGHLIGHT_COLOUR_LIGHT_OPAQUE, TEXT_COLOUR_LIGHT } from './constants.js';
import { config } from './ipc.js';
import App from './main/index.js';
import Friend from './friend/index.js';
import DiscordSetup from './discord/index.js';
import AddFriend from './add-friend/index.js';
import Preferences from './preferences/index.js';
import AddAccountManualPrompt from './add-account-manual/index.js';
import Album from './album/index.js';

AppRegistry.registerComponent('App', () => App);
AppRegistry.registerComponent('Friend', () => Friend);
AppRegistry.registerComponent('DiscordPresence', () => DiscordSetup);
AppRegistry.registerComponent('AddFriend', () => AddFriend);
AppRegistry.registerComponent('Preferences', () => Preferences);
AppRegistry.registerComponent('AddAccountManualPrompt', () => AddAccountManualPrompt);
AppRegistry.registerComponent('Album', () => Album);

const style = window.document.createElement('style');

style.textContent = `
:root {
    user-select: none;
    overflow-x: hidden;
    color-scheme: light dark;
}
*:focus-visible {
    outline-style: solid;
    outline-width: medium;
}
input,
input:focus-visible {
    outline: none 0;
}

select option {
    background-color: var(--nxapi-select-background, ${HIGHLIGHT_COLOUR_LIGHT_OPAQUE});
    color: var(--nxapi-select-foreground, ${TEXT_COLOUR_LIGHT});
}
`;

window.document.head.appendChild(style);

const rootTag = window.document.createElement('div');

rootTag.style.minHeight = '100vh';
window.document.body.appendChild(rootTag);

AppRegistry.runApplication(config.type, {
    rootTag,
    initialProps: config.props,
});
