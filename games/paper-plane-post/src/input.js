// One button, from four places. Hold to dive, let go to soar.
//
// Keyboard, mouse, touch anywhere on the stage, and a gamepad all feed the same
// little state object, plus one-shot commands for pause, mute and restart.

const DIVE = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'ArrowDown', 'KeyS']);
const PAUSE = new Set(['Escape', 'KeyP']);
// Anything the player might actually be clicking instead of flying.
const UI = 'button, a, input, select, .overlay, .card';

export class Input {
  constructor() {
    this.keys = new Set();
    this.pointer = false;
    this.touch = false;
    this.padDive = false;
    this.padStart = false;
    this.commands = new Set();
    this.wasDown = false;
    this.pressed = false;
    this.released = false;

    window.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const code = event.code;
      if (DIVE.has(code) || PAUSE.has(code) || code === 'KeyM' || code === 'KeyR') event.preventDefault();
      if (event.repeat) return;
      this.keys.add(code);
      if (PAUSE.has(code)) this.commands.add('pause');
      if (code === 'KeyM') this.commands.add('mute');
      if (code === 'KeyR') this.commands.add('restart');
      if (code === 'Enter' || code === 'NumpadEnter') this.commands.add('confirm');
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer = false;
      this.touch = false;
    });
  }

  /** Make `element` the hold area: a press anywhere on it dives. */
  bindHold(element) {
    const down = (event) => {
      if (event.target.closest && event.target.closest(UI)) return;
      if (event.pointerType === 'touch') this.touch = true;
      else this.pointer = true;
      element.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const up = () => {
      this.pointer = false;
      this.touch = false;
    };
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    if (!pad) {
      this.padDive = false;
      this.padStart = false;
      return false;
    }
    const dive = !!pad.buttons[0]?.pressed
      || !!pad.buttons[7]?.pressed
      || !!pad.buttons[6]?.pressed
      || !!pad.buttons[12]?.pressed
      || (pad.axes[1] || 0) < -0.5;
    this.padDive = dive;
    const start = !!pad.buttons[9]?.pressed;
    if (start && !this.padStart) this.commands.add('pause');
    this.padStart = start;
    if (pad.buttons[1]?.pressed) this.commands.add('confirm');
    return dive;
  }

  /** The controls for this step. */
  read() {
    const pad = this.readPad();
    let held = this.pointer || this.touch || pad;
    if (!held) {
      for (const code of this.keys) {
        if (DIVE.has(code)) {
          held = true;
          break;
        }
      }
    }
    this.pressed = held && !this.wasDown;
    this.released = !held && this.wasDown;
    this.wasDown = held;
    return { dive: held, pressed: this.pressed, released: this.released };
  }

  /** Consume a one-shot command such as pause, mute, restart or confirm. */
  take(command) {
    if (!this.commands.has(command)) return false;
    this.commands.delete(command);
    return true;
  }
}
