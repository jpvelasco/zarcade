// Mouse, touch and keyboard. Turns drags into a slingshot pull (world
// units, the bean's offset from the pouch) and taps into power use.
import { SLING, MAX_PULL, MIN_PULL } from './config.js';

export class Input {
  constructor(canvas, renderer, getState) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.getState = getState;
    this.enabled = false;
    this.pull = null; // current aim from a pointer drag or the keys
    this.drag = null;
    this.actions = [];
    this.keys = new Set();
    this.pressed = [];
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.kb = { angle: 0.62, power: 0.82, active: false };

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', () => this.cancel());
    addEventListener('blur', () => { this.cancel(); this.keys.clear(); });
    addEventListener('keydown', (e) => {
      if (e.repeat && !e.code.startsWith('Arrow')) return;
      this.keys.add(e.code);
      this.pressed.push(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  down(e) {
    if (!e.isPrimary) return;
    this.mode = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (!this.enabled) return;
    const state = this.getState();
    if (state === 'flying') { this.actions.push({ type: 'power' }); return; }
    if (state !== 'aim') return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const pouch = this.renderer.pouchScreen();
    const near = Math.hypot(e.clientX - pouch.x, e.clientY - pouch.y) < this.renderer.unitPx * 2.6;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, absolute: near && this.mode === 'mouse' };
    this.kb.active = false;
    this.pull = { x: 0, y: 0 };
    this.actions.push({ type: 'grab' });
  }

  move(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const u = this.renderer.unitPx;
    let x, y;
    if (this.drag.absolute) {
      const w = this.renderer.toWorld(e.clientX, e.clientY);
      x = w.x - SLING.x;
      y = w.y - SLING.y;
    } else {
      // Relative drags get a little extra reach so phones need less room.
      const gain = this.mode === 'touch' ? 1.5 : 1.15;
      x = ((e.clientX - this.drag.x) / u) * gain;
      y = (-(e.clientY - this.drag.y) / u) * gain;
    }
    const len = Math.hypot(x, y);
    if (len > MAX_PULL) { x *= MAX_PULL / len; y *= MAX_PULL / len; }
    this.pull = { x, y };
  }

  up(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.move(e);
    const p = this.pull;
    this.drag = null;
    if (p && Math.hypot(p.x, p.y) >= MIN_PULL) this.actions.push({ type: 'launch', pull: p });
    else this.actions.push({ type: 'cancel' });
    this.pull = null;
  }

  cancel() {
    if (this.drag) this.actions.push({ type: 'cancel' });
    this.drag = null;
    this.pull = null;
  }

  consume(code) {
    const i = this.pressed.indexOf(code);
    if (i < 0) return false;
    this.pressed.splice(i, 1);
    return true;
  }

  // Keyboard aiming: ↑ ↓ angle, ← → power, Space/Enter to launch.
  update(dt, state) {
    if (!this.enabled) { this.pressed.length = 0; return; }
    const k = this.keys;
    if (state === 'aim' && !this.drag) {
      let changed = false;
      if (k.has('ArrowUp') || k.has('KeyW')) { this.kb.angle = Math.min(1.45, this.kb.angle + dt * 0.9); changed = true; }
      if (k.has('ArrowDown') || k.has('KeyS')) { this.kb.angle = Math.max(-0.5, this.kb.angle - dt * 0.9); changed = true; }
      if (k.has('ArrowRight') || k.has('KeyD')) { this.kb.power = Math.min(1, this.kb.power + dt * 0.6); changed = true; }
      if (k.has('ArrowLeft') || k.has('KeyA')) { this.kb.power = Math.max(0.25, this.kb.power - dt * 0.6); changed = true; }
      if (changed) this.mode = 'keys';
      // Once you play with keys, the aim arc stays up from turn to turn.
      if (this.mode === 'keys') this.kb.active = true;
      if (this.kb.active) this.pull = this.kbPull();
    }
    for (const code of ['Space', 'Enter', 'NumpadEnter']) {
      if (!this.consume(code)) continue;
      this.mode = 'keys';
      if (state === 'flying') this.actions.push({ type: 'power' });
      else if (state === 'aim' && !this.drag) {
        if (!this.kb.active) { this.kb.active = true; this.pull = this.kbPull(); continue; }
        this.actions.push({ type: 'launch', pull: this.kbPull() });
        this.pull = null;
      }
    }
  }

  kbPull() {
    const len = this.kb.power * MAX_PULL;
    return { x: -Math.cos(this.kb.angle) * len, y: -Math.sin(this.kb.angle) * len };
  }

  take() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  clear() {
    this.actions = [];
    this.pressed.length = 0;
    this.drag = null;
    this.pull = null;
    this.kb.active = false;
  }
}
