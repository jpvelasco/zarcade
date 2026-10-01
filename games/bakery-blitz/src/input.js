// Keys and gamepad, kept away from the rest of the game so the mapping is one
// short list to read.

// Stations answer to the number row, in the order they stand in the kitchen.
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
const NUMPAD = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9'];

export function stationFromKey(code) {
  const digit = DIGITS.indexOf(code);
  if (digit >= 0) return digit;
  return NUMPAD.indexOf(code);
}

export const SERVE_KEYS = ['Space', 'Enter', 'NumpadEnter'];
export const PAUSE_KEYS = ['Escape', 'KeyP'];
export const MUTE_KEYS = ['KeyM'];
export const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
export const RIGHT_KEYS = ['ArrowRight', 'KeyD'];

// One gamepad, edge-triggered. `hit(name)` is true only on the frame a button
// goes down, so holding a button does not spam the kitchen.
export class Pad {
  constructor() {
    this.prev = {};
    this.state = {};
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    this.prev = this.state;
    if (!pad) {
      this.state = {};
      return false;
    }
    this.state = {
      left: !!pad.buttons[14]?.pressed || pad.axes[0] < -0.5,
      right: !!pad.buttons[15]?.pressed || pad.axes[0] > 0.5,
      up: !!pad.buttons[12]?.pressed || pad.axes[1] < -0.5,
      down: !!pad.buttons[13]?.pressed || pad.axes[1] > 0.5,
      act: !!pad.buttons[0]?.pressed,
      serve: !!pad.buttons[2]?.pressed || !!pad.buttons[1]?.pressed,
      start: !!pad.buttons[9]?.pressed,
      next: !!pad.buttons[5]?.pressed,
      back: !!pad.buttons[4]?.pressed,
    };
    return true;
  }

  hit(name) {
    return !!this.state[name] && !this.prev[name];
  }
}
