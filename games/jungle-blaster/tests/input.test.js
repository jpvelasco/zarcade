import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny stand-in for the browser: Input listens on window and polls pads.
const listeners = {};
globalThis.window = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
let pads = [];
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true });
globalThis.performance ||= { now: () => 0 };
const { Input } = await import('../src/input.js');

const fire = (type, code) => listeners[type].forEach((fn) => fn({ code, repeat: false, preventDefault() {} }));
const pad = (pressed) => ({ axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });

test('a bomb key pressed in a menu does not set off a bomb when play starts', () => {
  const input = new Input();
  input.enabled = false;
  fire('keydown', 'KeyC');
  fire('keyup', 'KeyC');
  input.enabled = true;
  assert.equal(input.read(0).bombPressed, false);
});

test('a bomb tapped quickly during play still counts', () => {
  const input = new Input();
  input.enabled = true;
  fire('keydown', 'KeyC');
  fire('keyup', 'KeyC');
  assert.equal(input.read(0).bombPressed, true);
});

test('the gamepad A that pressed Resume does not jump; the next press does', () => {
  const input = new Input();
  input.enabled = true;
  pads = [pad([])];
  input.read(0);
  input.enabled = false;
  pads = [pad([0])];
  input.pollCommands();
  assert.ok(input.drain().includes('confirm'));
  input.enabled = true;
  assert.equal(input.read(0).jumpPressed, false, 'held A from the menu is not a fresh jump');
  assert.equal(input.read(0).jump, true, 'but it still counts as held');
  pads = [pad([])];
  input.read(0);
  pads = [pad([0])];
  assert.equal(input.read(0).jumpPressed, true);
  pads = [];
});
