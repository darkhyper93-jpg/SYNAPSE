// Entry point. Brings back the durable copy of the player's progress (see game/durable.js) before
// any game module reads storage, then starts the game, whatever happens with the copy.
import { restoreDurable } from './game/durable.js';
import { listenForInstall } from './game/install.js';

// The browser offers installing once, right after the page loads, often before the game below has
// loaded: start listening now so the Install button in Settings gets it. Web only (capacitor.js,
// loaded before this file in the native app, says when it is the app).
if (!window.Capacitor?.isNativePlatform?.()) listenForInstall();

Promise.resolve()
  .then(restoreDurable)
  .catch(() => 'skipped')
  .then(() => import('./main.js'));
