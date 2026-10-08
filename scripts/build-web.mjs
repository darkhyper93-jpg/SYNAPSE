// Copies the web game into www/ (Capacitor's webDir) and adds the Capacitor runtime.
// No bundler needed: the game is plain ES modules.
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const item of ['src', 'assets', 'manifest.webmanifest', 'sw.js', 'privacy.html']) {
  cpSync(join(root, item), join(out, item), { recursive: true });
}

const runtime = join(root, 'node_modules/@capacitor/core/dist/capacitor.js');
if (!existsSync(runtime)) {
  console.error('Missing @capacitor/core — run `npm install` first.');
  process.exit(1);
}
cpSync(runtime, join(out, 'capacitor.js'));

// Load the Capacitor runtime before the game module (native builds only).
const html = readFileSync(join(root, 'index.html'), 'utf8').replace(
  '<link rel="modulepreload" href="src/main.js" />',
  '<script src="capacitor.js"></script>\n    <link rel="modulepreload" href="src/main.js" />',
);
writeFileSync(join(out, 'index.html'), html);
console.log('www/ ready');
