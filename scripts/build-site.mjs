// Builds _site/: the game as GitHub Pages publishes it (a web app players can install).
// Only the game's own files; unlike www/ it has no Capacitor runtime, which only the APK needs.
//   npm run build:site
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, copyWebFiles } from './web-files.mjs';

/** Copies the game into `out` (default _site/). */
export function buildSite(out = join(ROOT, '_site')) {
  copyWebFiles(out);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSite();
  console.log('_site/ ready');
}
