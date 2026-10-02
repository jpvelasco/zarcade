// The one button has to work wherever a thumb lands, even right beside the
// HUD buttons (#63).

import test from 'node:test';
import assert from 'node:assert/strict';
import { holdTarget } from '../src/input.js';

// A tiny stand-in for DOM elements: `closest` matches by tag name only.
function el(tag, parent = null) {
  return {
    tag,
    parent,
    closest(selector) {
      const tags = selector.split(',').map((s) => s.trim());
      for (let node = this; node; node = node.parent) if (tags.includes(node.tag)) return node;
      return null;
    },
  };
}

const body = el('body');
const canvas = el('canvas', body);
const button = el('button', body);
const docAt = (hit) => ({ elementFromPoint: () => hit });

test('a touch that touch adjustment handed to a nearby button is still a hold', () => {
  const event = { pointerType: 'touch', target: button, clientX: 280, clientY: 62 };
  assert.equal(holdTarget(event, docAt(canvas)), canvas);
});

test('a touch really on the button stays a button press', () => {
  const event = { pointerType: 'touch', target: button, clientX: 300, clientY: 62 };
  assert.equal(holdTarget(event, docAt(button)), button);
});

test('mouse presses and presses on open sky are left alone', () => {
  assert.equal(holdTarget({ pointerType: 'mouse', target: button }, docAt(canvas)), button);
  assert.equal(holdTarget({ pointerType: 'touch', target: canvas }, docAt(button)), canvas);
  assert.equal(holdTarget({ pointerType: 'touch', target: button }, null), button);
});
