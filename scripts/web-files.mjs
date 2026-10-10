// The files that make up the game on the web: the same for the Android bundle (www/) and the
// GitHub Pages site (_site/). Tests, Android sources, notes and tooling never ship.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_FILES = ['index.html', 'src', 'assets', 'manifest.webmanifest', 'sw.js', 'privacy.html'];

/** Empties `out` and copies the game's files into it. */
export function copyWebFiles(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const item of WEB_FILES) cpSync(join(ROOT, item), join(out, item), { recursive: true });
}
