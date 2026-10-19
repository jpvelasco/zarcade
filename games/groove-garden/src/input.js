// Keyboard, touch, mouse and gamepad turned into lane presses with
// precise timestamps (performance.now() milliseconds), plus menu keys.
//
//   Keys    D F J K or ← ↓ ↑ →  (three lanes: D, F/J/Space, K or ← ↓/↑ →)
//   Touch   tap or hold a lane; slide your finger across for slides
//   Mouse   click a lane (optional)
//   Pad     d-pad ← ↓ ↑ → or X A Y B, in that lane order; Start pauses

const KEYS_4 = {
  KeyD: 0, ArrowLeft: 0, KeyS: 0,
  KeyF: 1, ArrowDown: 1,
  KeyJ: 2, ArrowUp: 2,
  KeyK: 3, ArrowRight: 3, KeyL: 3,
};
const KEYS_3 = {
  KeyD: 0, ArrowLeft: 0, KeyS: 0,
  KeyF: 1, KeyJ: 1, Space: 1, ArrowDown: 1, ArrowUp: 1,
  KeyK: 2, ArrowRight: 2, KeyL: 2,
};
// Standard gamepad buttons: 0 A, 1 B, 2 X, 3 Y, 12-15 d-pad up/down/left/right.
const PAD_4 = [[14, 2], [13, 0], [12, 3], [15, 1]];
const PAD_3 = [[14, 2], [13, 12, 0, 3], [15, 1]];

export class Input {
  constructor(surface, { laneAt, onLane }) {
    this.laneAt = laneAt; // (clientX, clientY) -> lane or null
    this.onLane = onLane; // (lane, down, perfMs, source)
    this.lanes = 4;
    this.playing = false;
    this.held = new Map(); // source key -> lane
    this.count = [0, 0, 0, 0];
    this.pressed = new Set(); // menu key edges
    this.padPrev = [];
    this.padEdges = new Set();
    this.pointerType = 'mouse';
    this.tapAnywhere = null; // optional callback for calibration taps

    addEventListener('keydown', (e) => {
      const map = this.lanes === 3 ? KEYS_3 : KEYS_4;
      if (this.playing && e.code in map) {
        e.preventDefault();
        if (!e.repeat) this.down(`k:${e.code}`, map[e.code], e.timeStamp);
        return;
      }
      if (this.tapAnywhere && !e.repeat) {
        // Calibration: lane keys always tap; Space and Enter tap unless they
        // would press some other button.
        const laneKey = e.code in map && e.code !== 'Space';
        const spaceTap = (e.code === 'Space' || e.code === 'Enter') && (!isFormTarget(e.target) || e.target.id === 'cal-tap');
        if (laneKey || spaceTap) {
          e.preventDefault();
          this.tapAnywhere(e.timeStamp);
          return;
        }
      }
      if (!e.repeat) this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.up(`k:${e.code}`, e.timeStamp));
    addEventListener('blur', () => this.releaseAll(performance.now()));

    surface.addEventListener('pointerdown', (e) => {
      this.pointerType = e.pointerType;
      if (!this.playing) return;
      e.preventDefault();
      const lane = this.laneAt(e.clientX, e.clientY);
      if (lane === null) return;
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
      this.down(`p:${e.pointerId}`, lane, e.timeStamp);
    });
    surface.addEventListener('pointermove', (e) => {
      const key = `p:${e.pointerId}`;
      if (!this.held.has(key)) return;
      const lane = this.laneAt(e.clientX, e.clientY);
      if (lane === null || lane === this.held.get(key)) return;
      // Sliding a finger into the next lane presses it, then lifts the old one.
      const old = this.held.get(key);
      this.held.set(key, lane);
      this.count[lane]++;
      if (this.count[lane] === 1) this.onLane(lane, true, e.timeStamp, 'slide');
      this.count[old]--;
      if (this.count[old] === 0) this.onLane(old, false, e.timeStamp, 'slide');
    });
    const end = (e) => this.up(`p:${e.pointerId}`, e.timeStamp);
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setLanes(n) {
    this.releaseAll(performance.now());
    this.lanes = n;
  }

  down(key, lane, t) {
    if (this.held.has(key) || lane >= this.lanes) return;
    this.held.set(key, lane);
    this.count[lane]++;
    if (this.count[lane] === 1) this.onLane(lane, true, t, key[0]);
  }

  up(key, t) {
    if (!this.held.has(key)) return;
    const lane = this.held.get(key);
    this.held.delete(key);
    this.count[lane]--;
    if (this.count[lane] === 0) this.onLane(lane, false, t, key[0]);
  }

  releaseAll(t) {
    for (const key of [...this.held.keys()]) this.up(key, t);
  }

  isDown(lane) {
    return this.count[lane] > 0;
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  consumePad(name) {
    const had = this.padEdges.has(name);
    this.padEdges.delete(name);
    return had;
  }

  clear() {
    this.pressed.clear();
    this.padEdges.clear();
  }

  get hasPad() {
    return !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
  }

  /** Poll the first gamepad: lane presses while playing, menu edges always. */
  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) return;
    const t = performance.now();
    const b = (i) => !!pad.buttons[i]?.pressed;
    const now = pad.buttons.map((_, i) => b(i));
    const edge = (i) => now[i] && !this.padPrev[i];
    const names = { 0: 'a', 1: 'b', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
    if (this.playing) {
      const map = this.lanes === 3 ? PAD_3 : PAD_4;
      map.forEach((buttons, lane) => {
        for (const i of buttons) {
          if (now[i] && !this.padPrev[i]) this.down(`g:${i}`, lane, t);
          if (!now[i] && this.padPrev[i]) this.up(`g:${i}`, t);
        }
      });
      if (edge(9)) this.padEdges.add('start');
    } else {
      for (const [i, name] of Object.entries(names)) if (edge(Number(i))) this.padEdges.add(name);
      if (this.tapAnywhere && (edge(0) || edge(12) || edge(13) || edge(14) || edge(15))) this.tapAnywhere(t);
    }
    this.padPrev = now;
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}
