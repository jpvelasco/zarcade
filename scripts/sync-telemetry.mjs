// Copies arcade/telemetry.js into every game folder. Games stay
// self-contained, so each keeps its own copy; the arcade tests check they
// all match this one.
import { copyFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'arcade', 'telemetry.js');
const games = (await readdir(join(root, 'games'), { withFileTypes: true })).filter((d) => d.isDirectory());
for (const game of games) {
  await copyFile(source, join(root, 'games', game.name, 'telemetry.js'));
  console.log(`telemetry.js -> games/${game.name}/`);
}
