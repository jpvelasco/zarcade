// Mouse, touch, keyboard and gamepad merged into Trip controls.
//   Mouse:  point at the water to aim; hold the button to charge the cast or
//           reel; click to hook; move left or right during a fight to steer.
//   Touch:  touch the water to aim and hold to charge; hold anywhere to
//           reel; tap to hook; ◀ ▶ buttons steer during a fight.
//   Keys:   Space holds / taps; ← → (A D) aim the cast and steer the fish.
//   Pad:    A holds / taps, right trigger reels gently, stick aims/steers.
export class Input {
  constructor(surface) {
    this.surface = surface;
    this.keys = new Set();
    this.pressed = new Set();
    this.mode = 'keys'; // keys | mouse | touch | pad
    this.mouse = { x: 0, y: 0, down: false, moved: false };
    this.touches = new Map();
    this.touchSteer = 0;
    this.pad = { buttons: {}, axisX: 0, trigger: 0 };
    this.padEdges = new Set();
    this.enabled = false;
    this.holdPrev = false;
    this.steerAnchor = null;

    addEventListener('keydown', (e) => {
      const t = e.target;
      const form = t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && (this.enabled || !form)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if ((e.code === 'Space' || e.code === 'Enter') && this.enabled && !this.blocked) this.tapQueued = true;
      }
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) this.mode = 'keys';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; this.touches.clear(); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'; }, { capture: true, passive: true });

    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mode = 'mouse';
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.moved = true;
      } else if (this.touches.has(e.pointerId)) {
        this.touches.get(e.pointerId).x = e.clientX;
      }
    });
    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        this.mode = 'mouse';
        this.mouse.down = true;
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        if (this.enabled) this.tapQueued = true;
        return;
      }
      e.preventDefault();
      this.mode = 'touch';
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.enabled) this.tapQueued = true;
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
    });
    const end = (e) => {
      if (e.pointerType === 'mouse') { this.mouse.down = false; return; }
      this.touches.delete(e.pointerId);
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.mouse.down = false; });
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
    this.pressed.clear();
    this.padEdges.clear();
    this.mouse.down = false;
    this.touches.clear();
    this.blocked = true; // a held button must be let go before it counts
    this.tapQueued = false;
  }

  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) { this.pad.axisX = 0; this.pad.trigger = 0; this.pad.buttons = {}; return; }
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8), lb: b(4), rb: b(5),
      left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) this.padEdges.add(k);
    if (Object.values(now).some(Boolean)) this.mode = 'pad';
    if (now.a && !this.pad.buttons.a && this.enabled) this.tapQueued = true;
    this.pad.buttons = now;
    let x = Math.abs(ax) > 0.18 ? ax : 0;
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    this.pad.axisX = x;
    this.pad.trigger = pad.buttons[7]?.value || 0;
  }

  // Controls for one frame. `aimAt(clientX)` turns a pointer into an aim
  // (0..1) or null when it isn't over the water.
  read(dt, state, aim, aimAt) {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    const touchHold = this.touches.size > 0;
    const trig = this.pad.trigger > 0.1;
    let hold = k('Space', 'Enter') || this.mouse.down || touchHold || !!this.pad.buttons.a || trig;
    if (this.blocked) {
      if (!hold) this.blocked = false;
      hold = false;
    }
    // A tap shorter than a frame still counts as a press.
    const press = (hold && !this.holdPrev) || (this.tapQueued && !this.blocked);
    this.tapQueued = false;
    this.holdPrev = hold;

    let axis = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    // Mouse steering: how far the pointer has moved sideways since the fight
    // began.
    let mouseSteer = 0;
    if (state === 'fight' && this.mode === 'mouse') {
      if (this.steerAnchor === null) this.steerAnchor = this.mouse.x;
      mouseSteer = mouseSteerFor(this.mouse.x - this.steerAnchor);
    } else if (state !== 'fight') {
      this.steerAnchor = null;
    }
    axis = Math.max(-1, Math.min(1, axis + this.pad.axisX + this.touchSteer + mouseSteer));

    let nextAim = null;
    if (state === 'ready' || state === 'charging') {
      if (axis !== 0) nextAim = Math.max(0, Math.min(1, aim + axis * dt * 0.6));
      else if (this.mode === 'mouse' && this.mouse.moved) nextAim = aimAt(this.mouse.x);
      else if (this.mode === 'touch' && touchHold && state === 'ready') {
        const t = this.touches.values().next().value;
        nextAim = aimAt(t.x);
      }
    }
    let reel;
    if (trig && !this.pad.buttons.a) reel = Math.min(1, this.pad.trigger * 1.1);
    return { hold, press, aim: nextAim, steer: axis, reel };
  }
}

// Sideways mouse movement (px since the fight began) to a steer of -1..1,
// with a small dead zone so a resting hand doesn't steer.
export const MOUSE_STEER = { dead: 14, full: 70 };
export function mouseSteerFor(dx) {
  const a = Math.abs(dx);
  if (a <= MOUSE_STEER.dead) return 0;
  return Math.sign(dx) * Math.min(1, (a - MOUSE_STEER.dead) / (MOUSE_STEER.full - MOUSE_STEER.dead));
}
