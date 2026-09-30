// Keyboard, touch, and gamepad merged into one flight input:
// { x, y, fire, missile, boost, brake, rollLeft, rollRight } with x/y in -1..1.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touchMode = false;
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.touchButtons = new Set();

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('touchstart', () => { this.touchMode = true; }, { once: true, passive: true });

    // Left half of the screen is a floating joystick.
    const pad = document.getElementById('stick-zone');
    const knob = document.getElementById('stick-knob');
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        this.stick.id = e.pointerId;
        this.stick.ox = e.clientX;
        this.stick.oy = e.clientY;
        knob.style.left = `${e.clientX}px`;
        knob.style.top = `${e.clientY}px`;
        knob.classList.add('on');
        try { pad.setPointerCapture(e.pointerId); } catch { /* optional */ }
      });
      pad.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.stick.id) return;
        const dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
        const max = 60;
        this.stick.x = Math.max(-1, Math.min(1, dx / max));
        this.stick.y = Math.max(-1, Math.min(1, -dy / max));
        knob.style.transform = `translate(calc(-50% + ${this.stick.x * max}px), calc(-50% + ${-this.stick.y * max}px))`;
      });
      const end = (e) => {
        if (e.pointerId !== this.stick.id) return;
        this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
        knob.classList.remove('on');
        knob.style.transform = '';
      };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    }
    for (const btn of document.querySelectorAll('#touch .tbtn')) {
      const key = btn.dataset.key;
      const on = (e) => { e.preventDefault(); this.touchButtons.add(key); btn.classList.add('active'); };
      const off = (e) => { e.preventDefault(); this.touchButtons.delete(key); btn.classList.remove('active'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
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
    let x = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    let y = (k('ArrowUp', 'KeyW') ? 1 : 0) - (k('ArrowDown', 'KeyS') ? 1 : 0);
    let fire = k('Space', 'KeyJ');
    let missile = k('KeyF', 'KeyK', 'Enter');
    let boost = k('ShiftLeft', 'ShiftRight');
    let brake = k('KeyX', 'ControlLeft');
    let rollLeft = k('KeyQ');
    let rollRight = k('KeyE');

    if (this.touchMode) {
      x += this.stick.x;
      y += this.stick.y;
      fire = fire || !this.touchButtons.has('hold'); // touch auto-fires
      missile = missile || this.touchButtons.has('missile');
      boost = boost || this.touchButtons.has('boost');
      if (this.touchButtons.has('roll')) { if (this.stick.x < 0) rollLeft = true; else rollRight = true; }
    }

    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.15) x += ax;
      if (Math.abs(ay) > 0.15) y -= ay;
      fire = fire || !!pad.buttons[0]?.pressed;
      missile = missile || !!pad.buttons[1]?.pressed;
      boost = boost || (pad.buttons[7]?.value || 0) > 0.3;
      brake = brake || (pad.buttons[6]?.value || 0) > 0.3;
      rollLeft = rollLeft || !!pad.buttons[4]?.pressed;
      rollRight = rollRight || !!pad.buttons[5]?.pressed;
      if (pad.buttons[9]?.pressed && !this.padStart) this.pressed.add('Escape');
      this.padStart = !!pad.buttons[9]?.pressed;
      if (pad.buttons[3]?.pressed && !this.padY) this.pressed.add('KeyC');
      this.padY = !!pad.buttons[3]?.pressed;
    }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), fire, missile, boost, brake, rollLeft, rollRight };
  }
}
