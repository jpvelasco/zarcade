// The on-screen keyboard: big friendly keys for touch play, and in lessons a
// guide that lights the next key, colours keys by finger and shows which
// finger to use on a little pair of hands.
import { ROWS, PUNCT_ROW, FINGERS, fingerFor, baseKey, needsShift, shiftSide } from './keys.js';

const HAND_FINGERS = {
  left: [['lp', 8, 30, 15], ['lr', 26, 14, 17], ['lm', 44, 6, 18], ['li', 62, 14, 17], ['th', 84, 50, 14]],
  right: [['th', 16, 50, 14], ['ri', 38, 14, 17], ['rm', 56, 6, 18], ['rr', 74, 14, 17], ['rp', 92, 30, 15]],
};

function handSvg(side) {
  const fingers = HAND_FINGERS[side]
    .map(([id, x, y, h]) => `<rect class="finger f-${id}" data-finger="${id}" x="${x - 7}" y="${y}" width="14" height="${54 - y + h}" rx="7"/>`)
    .join('');
  return `<svg class="hand ${side}" viewBox="0 0 100 100" aria-hidden="true">${fingers}<rect class="palm" x="6" y="52" width="88" height="44" rx="20"/></svg>`;
}

export class ScreenKeyboard {
  constructor(root, { onKey, onSpecial } = {}) {
    this.root = root;
    this.onKey = onKey || (() => {});
    this.onSpecial = onSpecial || (() => {});
    this.shift = false;
    this.keys = new Map();
    this.hinted = [];
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.guide = document.createElement('div');
    this.guide.className = 'kb-guide';
    this.guide.innerHTML = `${handSvg('left')}<p class="kb-finger" aria-live="polite"></p>${handSvg('right')}`;
    r.appendChild(this.guide);
    this.fingerLabel = this.guide.querySelector('.kb-finger');
    const rows = [...ROWS.map((row) => row.slice()), PUNCT_ROW.slice()];
    rows.forEach((row, ri) => {
      const el = document.createElement('div');
      el.className = `kb-row row-${ri}`;
      if (ri === 2) el.appendChild(this.makeKey('shift', '⇧', 'kb-shift wide shift-only', 'left'));
      for (const k of row) {
        const extra = k === ';' ? 'semi-only' : /[a-z]/.test(k) ? '' : 'punct-only';
        el.appendChild(this.makeKey(k, k, extra));
      }
      if (ri === 2) el.appendChild(this.makeKey('shift', '⇧', 'kb-shift wide shift-only', 'right'));
      if (ri === 3) el.classList.add('punct-only');
      r.appendChild(el);
    });
    const last = document.createElement('div');
    last.className = 'kb-row row-space';
    last.appendChild(this.makeKey(' ', 'space', 'kb-space'));
    const spin = document.createElement('button');
    spin.type = 'button';
    spin.className = 'kb-key kb-spin';
    spin.textContent = '★ Spin';
    spin.setAttribute('aria-label', 'Star Spin');
    spin.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onSpecial(); });
    this.spin = spin;
    last.appendChild(spin);
    r.appendChild(last);
  }

  makeKey(k, label, extra = '', side = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kb-key ${extra}`.trim();
    b.textContent = label;
    b.dataset.key = k;
    if (side) b.dataset.side = side;
    const finger = k === 'shift' ? (side === 'left' ? 'lp' : 'rp') : fingerFor(k);
    if (finger) b.dataset.finger = finger;
    b.setAttribute('aria-label', k === ' ' ? 'space' : k === 'shift' ? `${side} shift` : k);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (k === 'shift') { this.setShift(!this.shift); return; }
      let ch = k;
      if (this.shift && /[a-z]/.test(k)) ch = k.toUpperCase();
      if (this.shift) this.setShift(false);
      this.onKey(ch);
    });
    if (k !== 'shift') {
      const list = this.keys.get(k) || [];
      list.push(b);
      this.keys.set(k, list);
    } else {
      (this.shiftKeys ||= []).push(b);
    }
    return b;
  }

  setShift(on) {
    this.shift = on;
    this.root.classList.toggle('shifted', on);
    for (const b of this.shiftKeys) b.classList.toggle('on', on);
    for (const [k, list] of this.keys) if (/[a-z]/.test(k)) for (const b of list) b.textContent = on ? k.toUpperCase() : k;
  }

  // punct: show punctuation and Shift; shift: just Shift (capitals);
  // semicolon: show ;; guide: lesson hints.
  configure({ punct = false, shift = false, semicolon = false, guide = false, fingers = false } = {}) {
    this.root.classList.toggle('show-punct', punct);
    this.root.classList.toggle('show-shift', shift || punct);
    this.root.classList.toggle('show-semi', semicolon || punct);
    this.root.classList.toggle('guide', guide);
    this.root.classList.toggle('fingers', fingers || guide);
    this.setShift(false);
    this.hint(null);
  }

  setSpecialReady(ready) {
    this.spin.classList.toggle('ready', ready);
  }

  // Light the key (and Shift) for the next character, and name the finger.
  hint(ch) {
    if (ch === this.lastHint) return;
    this.lastHint = ch;
    for (const b of this.hinted) b.classList.remove('next');
    this.hinted = [];
    for (const f of this.guide.querySelectorAll('.finger.on')) f.classList.remove('on');
    if (ch == null) { this.fingerLabel.textContent = ''; return; }
    const k = baseKey(ch);
    const list = this.keys.get(k === '?' ? '?' : k) || [];
    for (const b of list) { b.classList.add('next'); this.hinted.push(b); }
    const finger = fingerFor(ch);
    const parts = [];
    if (finger) {
      for (const f of this.guide.querySelectorAll(`.finger.f-${finger}`)) f.classList.add('on');
      parts.push(`<b>${ch === ' ' ? 'Space' : ch}</b> · ${FINGERS[finger].name}`);
    }
    if (needsShift(ch)) {
      const side = shiftSide(ch);
      for (const b of this.shiftKeys) if (b.dataset.side === side) { b.classList.add('next'); this.hinted.push(b); }
      const pinky = side === 'left' ? 'lp' : 'rp';
      for (const f of this.guide.querySelectorAll(`.finger.f-${pinky}`)) f.classList.add('on');
      parts.push(`+ ${side} Shift`);
    }
    this.fingerLabel.innerHTML = parts.join(' ');
  }

  // Flash a key green or red after it is typed (physical or on-screen).
  flash(ch, ok) {
    const list = this.keys.get(baseKey(ch)) || [];
    for (const b of list) {
      b.classList.remove('hit', 'miss');
      void b.offsetWidth;
      b.classList.add(ok ? 'hit' : 'miss');
    }
  }
}
