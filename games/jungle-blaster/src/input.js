// Keyboard, gamepads and the on-screen stick, folded into one controls
// object per player: { left, right, up, down, jump, jumpPressed, shoot,
// bombPressed }. One-shot commands (pause, mute) are queued separately.

const SOLO = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'KeyJ', 'Space'],
  shoot: ['KeyX', 'KeyK'],
  bomb: ['KeyC', 'KeyL'],
};

// Two players on one keyboard: left side and right side.
const DUO = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['KeyF', 'Space'], shoot: ['KeyG'], bomb: ['KeyH'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['Comma', 'Numpad1'], shoot: ['Period', 'Numpad2'], bomb: ['Slash', 'Numpad3'] },
];

const GAME_KEYS = new Set([...Object.values(SOLO).flat(), ...DUO.flatMap((m) => Object.values(m).flat()), 'Escape', 'KeyP', 'KeyM']);
const AXIS = 0.42;

const blank = () => ({ left: false, right: false, up: false, down: false, jump: false, shoot: false, bomb: false });

export class Input {
  constructor() {
    this.keys = new Set();
    this.players = 1;
    this.enabled = false;
    this.commands = [];
    this.prev = [blank(), blank()];
    this.pressQueue = [{ jump: false, bomb: false }, { jump: false, bomb: false }];
    this.touch = { ...blank(), active: false };
    this.padPrev = [];
    this.lastPad = 0;

    window.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const code = event.code;
      if (this.enabled && GAME_KEYS.has(code)) event.preventDefault();
      if (event.repeat) return;
      this.keys.add(code);
      if (code === 'Escape' || code === 'KeyP') this.commands.push('pause');
      if (code === 'KeyM') this.commands.push('mute');
      this.queuePresses();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      Object.assign(this.touch, blank());
    });
  }

  setPlayers(n) {
    this.players = n === 2 ? 2 : 1;
  }

  /** Remember presses that start and end between two frames. */
  queuePresses() {
    for (let i = 0; i < 2; i += 1) {
      const k = this.keyState(i);
      if (k.jump) this.pressQueue[i].jump = true;
      if (k.bomb) this.pressQueue[i].bomb = true;
    }
  }

  keyState(i) {
    const map = this.players === 2 ? DUO[i] : i === 0 ? SOLO : null;
    const out = blank();
    if (!map) return out;
    for (const name of Object.keys(out)) out[name] = map[name].some((code) => this.keys.has(code));
    return out;
  }

  pads() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return list;
  }

  padState(pad) {
    const out = blank();
    if (!pad) return out;
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    out.left = ax < -AXIS || b(14);
    out.right = ax > AXIS || b(15);
    out.up = ay < -AXIS || b(12);
    out.down = ay > AXIS || b(13);
    out.jump = b(0);
    out.shoot = b(2) || b(1) || b(7);
    out.bomb = b(3) || b(5);
    out.start = b(9);
    out.back = b(1);
    return out;
  }

  /** Which pad drives which player. */
  padFor(i, pads) {
    if (this.players === 1) return i === 0 ? pads : [];
    if (pads.length >= 2) return [pads[i]];
    return i === 1 ? pads.slice(0, 1) : [];
  }

  /** Poll gamepads: start buttons become pause commands; menus get d-pad edges. */
  pollCommands() {
    const pads = this.pads();
    pads.forEach((pad, i) => {
      const now = this.padState(pad);
      const before = this.padPrev[i] || blank();
      if (now.start && !before.start) this.commands.push('pause');
      if (!this.enabled) {
        if (now.up && !before.up) this.commands.push('navUp');
        if (now.down && !before.down) this.commands.push('navDown');
        if (now.left && !before.left) this.commands.push('navLeft');
        if (now.right && !before.right) this.commands.push('navRight');
        if (now.jump && !before.jump) this.commands.push('confirm');
        if (now.back && !before.back) this.commands.push('back');
      }
      this.padPrev[i] = now;
    });
  }

  /** Controls for player i this step. */
  read(i) {
    const pads = this.pads();
    const out = this.keyState(i);
    for (const pad of this.padFor(i, pads)) {
      const s = this.padState(pad);
      for (const key of Object.keys(out)) out[key] = out[key] || s[key];
      if (s.left || s.right || s.jump || s.shoot) this.lastPad = performance.now();
    }
    if (i === 0) {
      const t = this.touch;
      for (const key of Object.keys(out)) out[key] = out[key] || !!t[key];
    }
    const prev = this.prev[i];
    const queued = this.pressQueue[i];
    const controls = {
      left: out.left && !out.right,
      right: out.right && !out.left,
      up: out.up,
      down: out.down,
      jump: out.jump,
      jumpPressed: (out.jump && !prev.jump) || queued.jump,
      shoot: out.shoot,
      bombPressed: (out.bomb && !prev.bomb) || queued.bomb,
    };
    queued.jump = false;
    queued.bomb = false;
    this.prev[i] = out;
    return controls;
  }

  take(command) {
    const i = this.commands.indexOf(command);
    if (i < 0) return false;
    this.commands.splice(i, 1);
    return true;
  }

  drain() {
    const list = this.commands;
    this.commands = [];
    return list;
  }

  // ------------------------------------------------------------- touch

  /** Wire the virtual stick and buttons. */
  bindTouch(stick, knob, buttons) {
    let id = null;
    let ox = 0;
    let oy = 0;
    const set = (dx, dy) => {
      const dead = 12;
      const t = this.touch;
      t.left = dx < -dead && Math.abs(dx) > Math.abs(dy) * 0.45;
      t.right = dx > dead && Math.abs(dx) > Math.abs(dy) * 0.45;
      t.up = dy < -dead && Math.abs(dy) > Math.abs(dx) * 0.45;
      t.down = dy > dead && Math.abs(dy) > Math.abs(dx) * 0.45;
      const len = Math.min(34, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(ang) * len}px, ${Math.sin(ang) * len}px)`;
    };
    stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      id = event.pointerId;
      stick.setPointerCapture(id);
      const rect = stick.getBoundingClientRect();
      ox = rect.left + rect.width / 2;
      oy = rect.top + rect.height / 2;
      set(event.clientX - ox, event.clientY - oy);
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== id) return;
      set(event.clientX - ox, event.clientY - oy);
    });
    const end = (event) => {
      if (event.pointerId !== id) return;
      id = null;
      set(0, 0);
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    for (const button of buttons) {
      const action = button.dataset.hold;
      const on = (event) => {
        event.preventDefault();
        this.touch[action] = true;
        if (action === 'jump') this.pressQueue[0].jump = true;
        if (action === 'bomb') this.pressQueue[0].bomb = true;
        button.classList.add('down');
      };
      const off = (event) => {
        event.preventDefault();
        this.touch[action] = false;
        button.classList.remove('down');
      };
      button.addEventListener('pointerdown', on);
      button.addEventListener('pointerup', off);
      button.addEventListener('pointercancel', off);
      button.addEventListener('pointerleave', off);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    }
  }
}
