// Background solving so hints and the daily puzzle never stall a frame.
import { parseLevel } from './board.js';
import { solve } from './solver.js';
import { generateDaily } from './daily.js';

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'hint') {
      const board = parseLevel(msg.level);
      const s = solve(board, { startBound: msg.level.par, maxCost: msg.level.par + 6, nodeLimit: 1500000 });
      self.postMessage({ id: msg.id, type: 'hint', solved: s.solved, order: s.solved ? s.order : [] });
    } else if (msg.type === 'daily') {
      self.postMessage({ id: msg.id, type: 'daily', level: generateDaily(msg.date) });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, type: 'error', message: String(err && err.message) });
  }
};
