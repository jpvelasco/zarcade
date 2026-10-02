import test from 'node:test';
import assert from 'node:assert/strict';

// Input listens on window; give it a tiny stand-in so its rules run in Node.
const handlers = {};
globalThis.addEventListener = (type, fn) => { (handlers[type] ||= []).push(fn); };
const { Input } = await import('../src/input.js');
const key = (code) => { for (const fn of handlers.keydown) fn({ code, repeat: false, target: null, preventDefault() {} }); for (const fn of handlers.keyup) fn({ code }); };

test('presses made during play never replay as menu input later', () => {
  const input = new Input();
  key('ArrowUp'); key('ArrowLeft'); key('Enter'); key('Space');
  const ctl = input.read();
  assert.equal(ctl.attack, true);
  for (const name of ['up', 'left', 'confirm', 'back']) assert.equal(input.consume(name), false, name);
});

test('menu edges still arrive while a menu is open', () => {
  const input = new Input();
  key('ArrowDown'); key('Enter');
  assert.equal(input.consume('down'), true);
  assert.equal(input.consume('confirm'), true);
});
