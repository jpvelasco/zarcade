// Keyboard, swipes (touch or mouse drag) and gamepad, merged into one
// queue of presses: left, right, jump, roll.
//   Keys:  ← → / A D change lane, ↑ / W / Space jump, ↓ / S roll.
//   Swipe: fires as soon as the finger travels SWIPE_PX, not on release.
//          One swipe is one action: a long swipe never moves two lanes, but
//          turning mid-swipe (up, then left) can add a different action.
//   Pad:   d-pad or stick for lanes, A / up jump, B / down roll, Start pauses.
const SWIPE_PX = 22;
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'roll', KeyS: 'roll',
};

export class Input {
  constructor(surface) {
    this.queue = [];
    this.pressed = new Set();
    this.enabled = false;
    this.mode = 'keys'; // keys | touch | pad
    this.swipe = null;
    this.pad = {};
    this.padEdges = new Set();

    addEventListener('keydown', (e) => {
      if (isFormTarget(e.target) && !this.enabled) {
        // Let buttons and links handle Enter/Space in menus.
        if (e.code === 'Space' || e.code === 'Enter') return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.pressed.add(e.code);
      const a = KEYMAP[e.code];
      if (a && this.enabled) {
        this.queue.push(a);
        this.mode = 'keys';
      }
    });
    addEventListener('blur', () => { this.swipe = null; });

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType !== 'mouse') this.mode = 'touch';
      this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: [] };
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
      if (e.pointerType !== 'mouse') e.preventDefault();
    });
    surface.addEventListener('pointermove', (e) => {
      const s = this.swipe;
      if (!s || e.pointerId !== s.id) return;
      const a = swipeStep(s, e.clientX, e.clientY);
      if (a && this.enabled) this.queue.push(a);
    });
    const end = (e) => {
      if (this.swipe && e.pointerId === this.swipe.id) this.swipe = null;
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
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
    this.queue.length = 0;
    this.pressed.clear();
    this.padEdges.clear();
  }

  get hasPad() {
    return !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
  }

  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) return;
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8),
      left: b(14) || ax < -0.55, right: b(15) || ax > 0.55, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    };
    for (const k in now) {
      if (now[k] && !this.pad[k]) {
        this.padEdges.add(k);
        if (this.enabled) {
          this.mode = 'pad';
          if (k === 'left' || k === 'right') this.queue.push(k);
          else if (k === 'a' || k === 'up' || k === 'y') this.queue.push('jump');
          else if (k === 'b' || k === 'down' || k === 'x') this.queue.push('roll');
        }
      }
    }
    this.pad = now;
  }

  // Presses since the last call, as World controls. Only one of each per
  // frame; a second press of the same kind waits for the next frame.
  take() {
    const out = { left: false, right: false, jump: false, roll: false };
    const rest = [];
    for (const a of this.queue) {
      if (out[a] || ((a === 'left' || a === 'right') && (out.left || out.right))) rest.push(a);
      else out[a] = true;
    }
    this.queue = rest.slice(0, 4);
    return out;
  }
}

// One pointer move of a swipe: returns the action it fires, or null. The
// swipe re-anchors after each action, and each direction fires once.
export function swipeStep(s, x, y) {
  const dx = x - s.x;
  const dy = y - s.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  let a;
  if (Math.abs(dx) > Math.abs(dy)) a = dx < 0 ? 'left' : 'right';
  else a = dy < 0 ? 'jump' : 'roll';
  s.x = x;
  s.y = y;
  if (s.fired.includes(a)) return null;
  s.fired.push(a);
  return a;
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
}
