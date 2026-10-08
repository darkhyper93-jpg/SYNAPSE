// Entry point. Brings back the durable copy of the player's progress (see game/durable.js) before
// any game module reads storage, then starts the game, whatever happens with the copy.
import { restoreDurable } from './game/durable.js';

Promise.resolve()
  .then(restoreDurable)
  .catch(() => 'skipped')
  .then(() => import('./main.js'));
