// Keyboard, touch, and gamepad, merged into one driving input:
// { throttle, brake, steer, nitro, fire } with steer +1 = right on screen.
const PAD_PRESSES = [[9, 'Escape'], [0, 'PadA'], [12, 'PadUp'], [13, 'PadDown'], [14, 'PadLeft'], [15, 'PadRight']];

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = new Set();
    this.touchMode = false;
    this.pressed = new Set(); // one-shot actions (pause, mute)

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // The two steering buttons work as one pad: whichever half a finger is
    // over steers, so a thumb can slide from ◀ to ▶ without lifting.
    const pad = document.querySelector('#touch .touch-left');
    const sides = new Map();
    const sideOf = (e) => {
      const r = pad.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? 'left' : 'right';
    };
    const steerPad = () => {
      for (const key of ['left', 'right']) {
        const on = [...sides.values()].includes(key);
        if (on) this.touch.add(key); else this.touch.delete(key);
        pad.querySelector(`[data-key=${key}]`).classList.toggle('active', on);
      }
    };
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { pad.setPointerCapture(e.pointerId); } catch { /* still works without capture */ }
        sides.set(e.pointerId, sideOf(e));
        steerPad();
      });
      pad.addEventListener('pointermove', (e) => {
        if (!sides.has(e.pointerId)) return;
        sides.set(e.pointerId, sideOf(e));
        steerPad();
      });
      const lift = (e) => { if (sides.delete(e.pointerId)) steerPad(); };
      pad.addEventListener('pointerup', lift);
      pad.addEventListener('pointercancel', lift);
      pad.addEventListener('lostpointercapture', lift);
      window.addEventListener('blur', () => { sides.clear(); steerPad(); });
    }

    for (const btn of document.querySelectorAll('#touch .touch-right .tbtn')) {
      const key = btn.dataset.key;
      const on = (e) => { e.preventDefault(); this.touch.add(key); btn.classList.add('active'); };
      const off = (e) => { e.preventDefault(); this.touch.delete(key); btn.classList.remove('active'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      // The lift may never arrive if the window loses focus mid-press.
      window.addEventListener('blur', () => { this.touch.delete(key); btn.classList.remove('active'); });
    }
    window.addEventListener('touchstart', () => { this.touchMode = true; }, { once: true, passive: true });
  }

  // Gamepad buttons as one-shot presses, polled every frame so Start can
  // resume from the pause menu and A / the d-pad can work the menus.
  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) return;
    this.padHeld = this.padHeld || {};
    for (const [i, code] of PAD_PRESSES) {
      const on = !!pad.buttons[i]?.pressed;
      if (on && !this.padHeld[i]) this.pressed.add(code);
      this.padHeld[i] = on;
    }
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearPressed() {
    this.pressed.clear();
  }

  read() {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    let throttle = k('ArrowUp', 'KeyW') ? 1 : 0;
    let brake = k('ArrowDown', 'KeyS') ? 1 : 0;
    let steer = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    let nitro = k('ShiftLeft', 'ShiftRight');
    let fire = k('Space', 'KeyF');

    // Touch: the gas is always on unless braking.
    if (this.touchMode) {
      if (this.touch.has('brake')) brake = 1;
      else throttle = 1;
      steer += (this.touch.has('right') ? 1 : 0) - (this.touch.has('left') ? 1 : 0);
      nitro = nitro || this.touch.has('nitro');
      fire = fire || this.touch.has('fire');
    }

    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (pad) {
      const x = pad.axes[0] || 0;
      if (Math.abs(x) > 0.15) steer += x;
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
      nitro = nitro || !!pad.buttons[0]?.pressed;
      fire = fire || !!pad.buttons[1]?.pressed || !!pad.buttons[2]?.pressed;
    }
    return { throttle, brake, steer: Math.max(-1, Math.min(1, steer)), nitro, fire };
  }
}
