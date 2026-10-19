// Sticker relic helpers. DOM-free.
import { STICKER } from './data.js';

// Sum one effect key over every sticker the run owns.
export function stickerSum(run, key) {
  let total = 0;
  for (const id of run.stickers) {
    const v = STICKER[id]?.fx[key];
    if (v) total += v;
  }
  return total;
}
