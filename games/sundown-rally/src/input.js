// Keyboard, touch, and gamepad, merged into one driving input:
// { throttle, brake, steer, nitro, fire } with steer +1 = right on screen.
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

    for (const btn of document.querySelectorAll('#touch .tbtn')) {
      const key = btn.dataset.key;
      const on = (e) => { e.preventDefault(); this.touch.add(key); btn.classList.add('active'); };
      const off = (e) => { e.preventDefault(); this.touch.delete(key); btn.classList.remove('active'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
    window.addEventListener('touchstart', () => { this.touchMode = true; }, { once: true, passive: true });
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
      if (pad.buttons[9]?.pressed && !this.padStart) this.pressed.add('Escape');
      this.padStart = !!pad.buttons[9]?.pressed;
    }
    return { throttle, brake, steer: Math.max(-1, Math.min(1, steer)), nitro, fire };
  }
}
