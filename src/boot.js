// Entry point. Brings back the durable copy of the player's progress (see game/durable.js) before
// any game module reads storage, then starts the game.
import { restoreDurable } from './game/durable.js';

restoreDurable().finally(() => import('./main.js'));
