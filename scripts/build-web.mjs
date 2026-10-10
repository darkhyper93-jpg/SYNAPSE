// Copies the web game into www/ (Capacitor's webDir) and adds the Capacitor runtime.
// No bundler needed: the game is plain ES modules.
import { cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT as root, copyWebFiles } from './web-files.mjs';

const out = join(root, 'www');
copyWebFiles(out);

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
