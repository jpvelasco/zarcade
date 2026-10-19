// Prints the TUNING table for src/levels.js: node games/bubble-bay/tests/calibrate.mjs
import { LEVELS } from '../src/levels.js';
import { calibrate } from '../src/ai.js';

const rows = LEVELS.map((level) => {
  const { supply, stars } = calibrate(level);
  return `[${supply}, ${stars[1]}, ${stars[2]}]`;
});
const lines = [];
for (let k = 0; k < rows.length; k += 13) lines.push(`  ${rows.slice(k, k + 13).join(', ')},`);
console.log(`const TUNING = [\n${lines.join('\n')}\n];`);
