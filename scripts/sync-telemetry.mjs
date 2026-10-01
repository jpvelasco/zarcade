// Copies the arcade's shared browser modules (telemetry.js, fullscreen.js)
// into every game folder. Games stay self-contained, so each keeps its own
// copies; the arcade tests check they all match these.
import { copyFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SHARED = ['telemetry.js', 'fullscreen.js'];
const root = resolve(import.meta.dirname, '..');
const games = (await readdir(join(root, 'games'), { withFileTypes: true })).filter((d) => d.isDirectory());
for (const game of games) {
  for (const file of SHARED) await copyFile(join(root, 'arcade', file), join(root, 'games', game.name, file));
  console.log(`${SHARED.join(', ')} -> games/${game.name}/`);
}
