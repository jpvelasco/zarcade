// Web Worker entry: runs the chess AI off the main thread so the board stays
// smooth while bots think.
import { createThinker } from './think.js';

const think = createThinker();
self.onmessage = (e) => {
  try {
    self.postMessage(think(e.data));
  } catch (err) {
    self.postMessage({ id: e.data && e.data.id, error: String(err && err.message || err) });
  }
};
