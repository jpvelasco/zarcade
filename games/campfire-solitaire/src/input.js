// Gamepad polling with edge detection. A press becomes one edge, in the frame
// it happens; the caller consumes edges it wants and `clear()`s the rest at the
// end of the frame, so a press never leaks from play into a menu or acts for
// several frames. The d-pad and stick repeat while held, for moving focus.

const DIRS = ['up', 'down', 'left', 'right'];

export class Pad {
  constructor() {
    this.prev = {};
    this.edges = new Set();
    this.repeatAt = {};
    this.connected = false;
  }

  poll(now) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const g of pads || []) if (g && g.connected !== false) { p = g; break; }
    this.connected = !!p;
    if (!p) {
      this.prev = {};
      return;
    }
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ax = p.axes[0] || 0;
    const ay = p.axes[1] || 0;
    const state = {
      a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8),
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
    };
    for (const k of Object.keys(state)) {
      if (state[k] && !this.prev[k]) {
        this.edges.add(k);
        this.repeatAt[k] = now + 380;
      } else if (state[k] && DIRS.includes(k) && now >= this.repeatAt[k]) {
        this.edges.add(k);
        this.repeatAt[k] = now + 150;
      }
    }
    this.prev = state;
  }

  take(k) {
    if (!this.edges.has(k)) return false;
    this.edges.delete(k);
    return true;
  }

  clear() {
    this.edges.clear();
  }
}
