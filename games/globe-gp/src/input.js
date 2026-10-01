// Keyboard, gamepad and touch merged into one driving input:
// { throttle, brake, steer (+1 right), drift, boost, reset }.

// Automatic gas during the countdown: off until just before GO, so touch
// players with auto-accelerate still get the perfect-start boost (the race
// gives it for gas pressed in the last second of the countdown).
export const AUTO_GAS_FROM = -0.6;
export function autoGas(raceTime) {
  return raceTime >= AUTO_GAS_FROM ? 1 : 0;
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = new Set();
    this.pressed = new Set();   // one-shot keys (pause, menus)
    this.touchMode = false;
    this.steerMode = 'buttons'; // buttons | tilt
    this.autoAccel = true;
    this.tilt = 0;
    this.padPrev = [];
    this.padUsed = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && !e.target.closest?.('input, select')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });

    for (const btn of document.querySelectorAll('#touch [data-key]')) {
      const key = btn.dataset.key;
      const on = (e) => { e.preventDefault(); this.touch.add(key); btn.classList.add('active'); };
      const off = (e) => { e.preventDefault(); this.touch.delete(key); btn.classList.remove('active'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
    window.addEventListener('touchstart', () => { this.touchMode = true; document.body.classList.add('touch'); }, { once: true, passive: true });
    if (window.matchMedia?.('(pointer: coarse)').matches) { this.touchMode = true; document.body.classList.add('touch'); }

    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma === null) return;
      // Landscape phones tilt around beta; portrait around gamma.
      const landscape = Math.abs(window.orientation || 0) === 90 || window.innerWidth > window.innerHeight;
      const angle = landscape ? (e.beta || 0) * Math.sign(window.orientation || 90) : e.gamma;
      this.tilt = Math.max(-1, Math.min(1, angle / 25));
    });
  }

  // iOS asks permission for motion data; must be called from a tap.
  async enableTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try { return (await DOE.requestPermission()) === 'granted'; } catch { return false; }
    }
    return !!DOE;
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearPressed() {
    this.pressed.clear();
  }

  pad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    return pads.find((p) => p && p.connected) || null;
  }

  // Edge-triggered gamepad buttons, for menus and pause.
  pollPad() {
    const pad = this.pad();
    if (!pad) return;
    const map = { 9: 'Escape', 0: 'PadA', 1: 'PadB', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
    for (const [i, code] of Object.entries(map)) {
      const down = !!pad.buttons[i]?.pressed;
      if (down && !this.padPrev[i]) { this.pressed.add(code); this.padUsed = true; }
      this.padPrev[i] = down;
    }
  }

  // `raceTime` is negative during the countdown.
  read(raceTime = 0) {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    let throttle = k('ArrowUp', 'KeyW') ? 1 : 0;
    let brake = k('ArrowDown', 'KeyS') ? 1 : 0;
    let steer = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    let drift = k('Space', 'ShiftLeft', 'ShiftRight');
    let boost = k('KeyX', 'Enter', 'NumpadEnter');
    let reset = this.consume('KeyR');

    if (this.touchMode) {
      if (this.touch.has('brake')) brake = 1;
      else if (this.touch.has('gas')) throttle = 1;
      else if (this.autoAccel) throttle = Math.max(throttle, autoGas(raceTime));
      if (this.steerMode === 'tilt') steer += this.tilt;
      else steer += (this.touch.has('right') ? 1 : 0) - (this.touch.has('left') ? 1 : 0);
      drift = drift || this.touch.has('drift');
      boost = boost || this.touch.has('boost');
    }

    const pad = this.pad();
    if (pad) {
      const x = pad.axes[0] || 0;
      if (Math.abs(x) > 0.12) steer += Math.sign(x) * (Math.abs(x) - 0.12) / 0.88;
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
      drift = drift || !!pad.buttons[5]?.pressed || !!pad.buttons[4]?.pressed || !!pad.buttons[1]?.pressed;
      boost = boost || !!pad.buttons[2]?.pressed || !!pad.buttons[3]?.pressed;
      if (pad.buttons[8]?.pressed) reset = true;
    }
    return { throttle, brake, steer: Math.max(-1, Math.min(1, steer)), drift, boost, reset };
  }
}
