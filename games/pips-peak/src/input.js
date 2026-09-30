// Keyboard, gamepad and on-screen controls folded into one tiny state object.

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const JUMP = new Set(['Space', 'KeyZ', 'KeyJ', 'ArrowUp', 'KeyW']);
const PAUSE = new Set(['Escape', 'KeyP']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, jump: false, down: false };
    this.jumpQueued = false;     // a press waiting to be handed to the sim
    this.jumpWasDown = false;
    this.padJump = false;
    this.padStart = false;
    this.commands = new Set();   // one-shot: 'pause', 'mute', 'restart'
    this.lastPointer = 0;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const code = event.code;
      if (LEFT.has(code) || RIGHT.has(code) || DOWN.has(code) || JUMP.has(code) || PAUSE.has(code) || code === 'KeyM' || code === 'KeyR') {
        event.preventDefault();
      }
      this.keys.add(code);
      if (PAUSE.has(code)) this.commands.add('pause');
      if (code === 'KeyM') this.commands.add('mute');
      if (code === 'KeyR') this.commands.add('restart');
      if (code === 'Enter') this.commands.add('confirm');
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.left = this.touch.right = this.touch.jump = this.touch.down = false;
    });
  }

  /** Wire an on-screen button that behaves like a held key. */
  bindTouch(element, action) {
    const set = (value) => (event) => {
      event.preventDefault();
      this.touch[action] = value;
      if (value && action === 'jump') this.jumpQueued = true;
    };
    element.addEventListener('pointerdown', set(true));
    element.addEventListener('pointerup', set(false));
    element.addEventListener('pointercancel', set(false));
    element.addEventListener('pointerleave', set(false));
    element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    if (!pad) {
      this.padJump = false;
      this.padStart = false;
      return { left: false, right: false, down: false, jump: false };
    }
    const axis = pad.axes[0] || 0;
    const vertical = pad.axes[1] || 0;
    const state = {
      left: axis < -0.35 || !!pad.buttons[14]?.pressed,
      right: axis > 0.35 || !!pad.buttons[15]?.pressed,
      down: vertical > 0.5 || !!pad.buttons[13]?.pressed,
      jump: !!pad.buttons[0]?.pressed || !!pad.buttons[1]?.pressed || !!pad.buttons[12]?.pressed,
    };
    if (state.jump && !this.padJump) this.jumpQueued = true;
    this.padJump = state.jump;
    const start = !!pad.buttons[9]?.pressed;
    if (start && !this.padStart) this.commands.add('pause');
    this.padStart = start;
    return state;
  }

  /** The controls for this frame. `jumpPressed` is true on the press edge only. */
  read() {
    const pad = this.readPad();
    const has = (set) => [...set].some((code) => this.keys.has(code));
    const jumpDown = has(JUMP) || this.touch.jump || pad.jump;
    if (jumpDown && !this.jumpWasDown) this.jumpQueued = true;
    this.jumpWasDown = jumpDown;
    const jumpPressed = this.jumpQueued;
    this.jumpQueued = false;
    return {
      left: has(LEFT) || this.touch.left || pad.left,
      right: has(RIGHT) || this.touch.right || pad.right,
      down: has(DOWN) || this.touch.down || pad.down,
      jump: jumpDown,
      jumpPressed,
    };
  }

  /** Consume a one-shot command such as pause or mute. */
  take(command) {
    if (!this.commands.has(command)) return false;
    this.commands.delete(command);
    return true;
  }
}
