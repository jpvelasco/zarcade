// The program panel: palette, colour brushes and the MAIN / P1 strips, with
// a caret, tap-to-add, tap-to-remove, drag and drop and a keyboard path.
// Pure DOM; it edits the program object it is given and reports edits.
import { tile, countTiles, MAX_NEST, REPEAT_MIN, REPEAT_MAX, nextUid } from './rules.js';
import { ICON, TILE_INFO, PALETTE_ORDER, COLOUR_INFO, colourBadge, tileLabel } from './icons.js';

const DRAG_PX = 8;

export class Panel {
  constructor({ palette, brushes, strips, ghost }, { onEdit, onBlocked, sound }) {
    this.paletteEl = palette;
    this.brushesEl = brushes;
    this.stripsEl = strips;
    this.ghost = ghost;
    this.onEdit = onEdit;
    this.onBlocked = onBlocked || (() => {});
    this.sound = sound;
    this.level = null;
    this.prog = { main: [], p1: [] };
    this.caret = { strip: 'main', block: null, index: 0 };
    this.brush = null;
    this.els = new Map();
    this.locked = false;
    this.drag = null;
    this.lit = { now: null, active: [], skip: null, bug: null };
    this.bindDrag();
  }

  setLevel(level, prog) {
    this.level = level;
    this.prog = prog;
    this.brush = null;
    this.caret = { strip: 'main', block: null, index: prog.main.length };
    this.buildPalette();
    this.render();
  }

  setProgram(prog) {
    this.prog = prog;
    this.caret = { strip: 'main', block: null, index: prog.main.length };
    this.render();
  }

  get hasP1() { return this.level && this.level.ops.includes('1') && this.level.limits.p1 > 0; }

  // ------------------------------------------------------------ palette

  buildPalette() {
    const ops = this.level.ops;
    this.paletteEl.textContent = '';
    for (const op of PALETTE_ORDER) {
      if (!ops.includes(op)) continue;
      const info = TILE_INFO[op];
      const b = document.createElement('button');
      b.className = `ptile tile op-${op === '*' ? 'L1' : op === '@' ? 'rep' : op === '1' ? 'p1' : op}`;
      b.dataset.op = op;
      b.innerHTML = `${ICON[op]}<kbd>${info.key}</kbd>`;
      b.setAttribute('aria-label', `Add ${info.name} (${info.key})`);
      b.title = `${info.name} (${info.key})`;
      this.paletteEl.appendChild(b);
    }
    this.brushesEl.textContent = '';
    this.brushesEl.classList.toggle('hidden', !ops.includes('c'));
    if (ops.includes('c')) {
      for (const c of ['r', 'b']) {
        const b = document.createElement('button');
        b.className = `brush c-${c}`;
        b.dataset.brush = c;
        b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${COLOUR_INFO[c].mark}</svg>`;
        b.setAttribute('aria-label', `${COLOUR_INFO[c].name} paint brush (C)`);
        b.setAttribute('aria-pressed', 'false');
        b.title = `${COLOUR_INFO[c].name} brush: tap tiles to paint them (C)`;
        b.addEventListener('click', () => this.setBrush(this.brush === c ? null : c));
        this.brushesEl.appendChild(b);
      }
    }
  }

  setBrush(c) {
    this.brush = c;
    for (const b of this.brushesEl.querySelectorAll('.brush')) b.setAttribute('aria-pressed', String(b.dataset.brush === c));
    this.stripsEl.classList.toggle('painting', !!c);
    this.sound?.play('click');
  }

  // -------------------------------------------------------------- model

  list(strip, block) {
    const root = this.prog[strip];
    if (block == null) return root;
    const found = findTile(root, block);
    return found ? found.tile.body : root;
  }

  depthOf(strip, block) {
    let d = 0;
    let b = block;
    while (b != null) {
      d++;
      const f = findTile(this.prog[strip], b);
      b = f ? f.parent : null;
    }
    return d;
  }

  limit(strip) { return strip === 'main' ? this.level.limits.main : this.level.limits.p1; }
  used(strip) { return countTiles(this.prog[strip]); }

  // Caret positions in reading order for a strip.
  positions(strip) {
    const out = [];
    const walkList = (list, block) => {
      for (let i = 0; i < list.length; i++) {
        out.push({ strip, block, index: i });
        if (list[i].op === '@') walkList(list[i].body, list[i].uid);
      }
      out.push({ strip, block, index: list.length });
    };
    walkList(this.prog[strip], null);
    return out;
  }

  insert(op, at = this.caret) {
    if (this.locked) return false;
    if (op === '1' && !this.hasP1) return false;
    if (!this.level.ops.includes(op)) return false;
    if (op === '1' && at.strip === 'p1' && !this.level.ops.includes('^')) {
      this.onBlocked('recursion', at.strip);
      return false;
    }
    if (this.used(at.strip) + 1 > this.limit(at.strip)) {
      this.onBlocked('full', at.strip);
      this.bump(at.strip);
      return false;
    }
    if (op === '@' && this.depthOf(at.strip, at.block) >= MAX_NEST) {
      this.onBlocked('nest', at.strip);
      return false;
    }
    const t = tile(op, { c: this.brush || '', n: 2 });
    const list = this.list(at.strip, at.block);
    const idx = Math.min(at.index, list.length);
    list.splice(idx, 0, t);
    this.caret = op === '@' ? { strip: at.strip, block: t.uid, index: 0 } : { strip: at.strip, block: at.block, index: idx + 1 };
    this.sound?.play('place', { n: this.used(at.strip) });
    this.render();
    this.pop(t.uid);
    this.onEdit('add', t);
    return true;
  }

  // Remove a tile by uid. A Repeat block leaves its contents in its place.
  remove(uid, { quiet = false, whole = false } = {}) {
    if (this.locked) return null;
    for (const strip of ['main', 'p1']) {
      const f = findTile(this.prog[strip], uid);
      if (!f) continue;
      const list = f.parent == null ? this.prog[strip] : findTile(this.prog[strip], f.parent).tile.body;
      list.splice(f.index, 1, ...(f.tile.op === '@' && !whole ? f.tile.body : []));
      this.caret = { strip, block: f.parent, index: f.index };
      if (!quiet) this.sound?.play('remove');
      this.render();
      if (!quiet) this.onEdit('remove', f.tile);
      return f.tile;
    }
    return null;
  }

  backspace() {
    const list = this.list(this.caret.strip, this.caret.block);
    if (this.caret.index > 0) {
      this.remove(list[this.caret.index - 1].uid);
    } else if (this.caret.block != null) {
      // At the start of a Repeat body: step out before the block.
      const f = findTile(this.prog[this.caret.strip], this.caret.block);
      this.caret = { strip: this.caret.strip, block: f.parent, index: f.index };
      this.render();
    }
  }

  deleteForward() {
    const list = this.list(this.caret.strip, this.caret.block);
    if (this.caret.index < list.length) this.remove(list[this.caret.index].uid);
  }

  // The tile just before the caret (for keyboard colour / count changes).
  caretTile() {
    const list = this.list(this.caret.strip, this.caret.block);
    if (this.caret.index > 0) return list[this.caret.index - 1];
    if (this.caret.block != null) return findTile(this.prog[this.caret.strip], this.caret.block).tile;
    return null;
  }

  paint(uid, c) {
    if (this.locked) return;
    const f = findAny(this.prog, uid);
    if (!f) return;
    f.tile.c = f.tile.c === c ? '' : c;
    if (!f.tile.c) delete f.tile.c;
    this.sound?.play('click');
    this.render();
    this.pop(uid);
    this.onEdit('paint', f.tile);
  }

  cycleColour() {
    const t = this.caretTile();
    if (!t || !this.level.ops.includes('c')) return;
    const next = !t.c ? 'r' : t.c === 'r' ? 'b' : '';
    this.paint(t.uid, next || t.c);
  }

  bumpCount(uid, delta) {
    if (this.locked) return;
    const f = findAny(this.prog, uid);
    if (!f || f.tile.op !== '@') return;
    let n = f.tile.n + delta;
    if (n > REPEAT_MAX) n = REPEAT_MIN;
    if (n < REPEAT_MIN) n = REPEAT_MAX;
    f.tile.n = n;
    this.sound?.play('place', { n });
    this.render();
    this.pop(uid);
    this.onEdit('count', f.tile);
  }

  repeatAtCaret(delta) {
    let t = this.caretTile();
    if (t && t.op !== '@' && this.caret.block != null) t = findTile(this.prog[this.caret.strip], this.caret.block).tile;
    if (t && t.op === '@') this.bumpCount(t.uid, delta);
  }

  moveCaret(delta) {
    const pos = this.positions(this.caret.strip);
    const i = pos.findIndex((p) => p.block === this.caret.block && p.index === this.caret.index);
    const j = Math.max(0, Math.min(pos.length - 1, (i < 0 ? pos.length - 1 : i) + delta));
    this.caret = pos[j];
    this.render();
  }

  switchStrip(dir) {
    if (!this.hasP1) return;
    const strip = this.caret.strip === 'main' ? 'p1' : 'main';
    void dir;
    this.caret = { strip, block: null, index: this.prog[strip].length };
    this.render();
  }

  clear() {
    if (this.locked) return;
    this.prog.main.length = 0;
    this.prog.p1.length = 0;
    this.caret = { strip: 'main', block: null, index: 0 };
    this.render();
    this.onEdit('clear');
  }

  // ------------------------------------------------------------- render

  render() {
    this.els.clear();
    this.stripsEl.textContent = '';
    this.stripsEl.appendChild(this.renderStrip('main'));
    if (this.hasP1) this.stripsEl.appendChild(this.renderStrip('p1'));
    this.applyHighlight();
  }

  renderStrip(strip) {
    const wrap = document.createElement('div');
    wrap.className = `strip strip-${strip}`;
    wrap.dataset.strip = strip;
    if (this.caret.strip === strip) wrap.classList.add('focus');
    const head = document.createElement('div');
    head.className = 'strip-head';
    const used = this.used(strip);
    const lim = this.limit(strip);
    head.innerHTML = `<span class="sh-icon ${strip}">${strip === 'main' ? ICON.main : ICON[1]}</span><span class="sh-count${used >= lim ? ' full' : ''}">${used}<small>/${lim}</small></span>`;
    head.setAttribute('aria-label', `${strip === 'main' ? 'Main program' : 'Procedure P1'}: ${used} of ${lim} tiles`);
    wrap.appendChild(head);
    const body = document.createElement('div');
    body.className = 'strip-body';
    body.dataset.strip = strip;
    body.dataset.block = '';
    this.renderList(body, this.prog[strip], strip, null);
    for (let i = used; i < lim; i++) {
      const slot = document.createElement('span');
      slot.className = 'slot';
      slot.dataset.strip = strip;
      body.appendChild(slot);
    }
    wrap.appendChild(body);
    return wrap;
  }

  renderList(container, list, strip, block) {
    for (let i = 0; i <= list.length; i++) {
      if (this.caret.strip === strip && this.caret.block === block && this.caret.index === i) {
        const c = document.createElement('span');
        c.className = 'caret';
        c.setAttribute('aria-hidden', 'true');
        container.appendChild(c);
      }
      if (i === list.length) break;
      const t = list[i];
      if (t.op === '@') {
        const blk = document.createElement('div');
        blk.className = `rblock${t.c ? ` painted c-${t.c}` : ''}`;
        blk.dataset.uid = t.uid;
        const headBtn = document.createElement('button');
        headBtn.className = 'rhead tile op-rep';
        headBtn.dataset.uid = t.uid;
        headBtn.dataset.strip = strip;
        headBtn.innerHTML = `${ICON['@']}${t.c ? colourBadge(t.c) : ''}`;
        headBtn.setAttribute('aria-label', `${tileLabel(t)}. Tap to remove the block.`);
        blk.appendChild(headBtn);
        const count = document.createElement('button');
        count.className = 'rcount';
        count.dataset.count = t.uid;
        count.innerHTML = `<span>×</span>${t.n}`;
        count.setAttribute('aria-label', `Repeat ${t.n} times. Tap to change.`);
        count.title = 'Tap to change how many times (+ / −)';
        blk.appendChild(count);
        const inner = document.createElement('div');
        inner.className = 'rbody';
        inner.dataset.strip = strip;
        inner.dataset.block = t.uid;
        this.renderList(inner, t.body, strip, t.uid);
        blk.appendChild(inner);
        container.appendChild(blk);
        this.els.set(t.uid, blk);
      } else {
        const b = document.createElement('button');
        b.className = `tile op-${t.op === '*' ? 'L1' : t.op === '1' ? 'p1' : t.op}${t.c ? ` painted c-${t.c}` : ''}`;
        b.dataset.uid = t.uid;
        b.dataset.strip = strip;
        b.innerHTML = `${ICON[t.op]}${t.c ? colourBadge(t.c) : ''}`;
        b.setAttribute('aria-label', `${tileLabel(t)}. Tap to remove.`);
        container.appendChild(b);
        this.els.set(t.uid, b);
      }
    }
  }

  pop(uid) {
    const el = this.els.get(uid);
    if (!el) return;
    el.classList.remove('popin');
    void el.offsetWidth;
    el.classList.add('popin');
  }

  bump(strip) {
    const el = this.stripsEl.querySelector(`.strip-${strip}`);
    if (!el) return;
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }

  // ---------------------------------------------------------- highlight

  highlight(h) {
    this.lit = { ...this.lit, ...h };
    this.applyHighlight();
  }

  clearHighlight() {
    this.lit = { now: null, active: [], skip: null, bug: null };
    this.applyHighlight();
  }

  applyHighlight() {
    for (const el of this.stripsEl.querySelectorAll('.now, .live, .skipped, .bug')) {
      el.classList.remove('now', 'live', 'skipped', 'bug');
      const badge = el.querySelector(':scope > .iter');
      if (badge) badge.remove();
    }
    const { now, active, skip, bug } = this.lit;
    for (const a of active || []) {
      const el = this.els.get(a.uid);
      if (!el) continue;
      el.classList.add('live');
      if (a.n) {
        const badge = document.createElement('span');
        badge.className = 'iter';
        badge.textContent = `${a.iter}/${a.n}`;
        el.appendChild(badge);
      }
    }
    if (now != null) this.els.get(now)?.classList.add('now');
    if (skip != null) this.els.get(skip)?.classList.add('skipped');
    if (bug != null) this.els.get(bug)?.classList.add('bug');
    const cur = now != null ? this.els.get(now) : null;
    if (cur && cur.scrollIntoView && this.stripsEl.scrollHeight > this.stripsEl.clientHeight) cur.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------- pointer input

  bindDrag() {
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const pal = e.target.closest('.ptile');
      const cnt = e.target.closest('.rcount');
      const tl = e.target.closest('.strip .tile');
      const slot = e.target.closest('.slot, .strip-body, .rbody, .strip-head');
      if (cnt) return; // a plain click
      if (!pal && !tl && !slot) return;
      this.drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        op: pal ? pal.dataset.op : null,
        uid: tl ? Number(tl.dataset.uid) : null,
        from: tl || pal,
        slot: !pal && !tl ? slot : null,
        moved: false,
      };
      if (pal || tl) e.preventDefault();
    };
    const onMove = (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId || d.slot) return;
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX || this.locked) return;
        d.moved = true;
        if (d.uid != null) {
          // Lift the tile out of the program while it is dragged.
          const f = findAny(this.prog, d.uid);
          d.lifted = f ? this.remove(d.uid, { quiet: true, whole: true }) : null;
          if (!d.lifted) { this.drag = null; return; }
        }
        this.ghost.innerHTML = d.from.innerHTML;
        this.ghost.className = `ghost ${d.from.className.replace(/\b(ptile|now|live|skipped|bug|popin)\b/g, '')}`;
        document.body.classList.add('dragging');
      }
      this.ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
      const at = this.dropTarget(e.clientX, e.clientY);
      if (at && (at.strip !== this.caret.strip || at.block !== this.caret.block || at.index !== this.caret.index)) {
        this.caret = at;
        this.render();
      }
      d.over = at;
    };
    const onUp = (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      document.body.classList.remove('dragging');
      this.ghost.className = 'ghost hidden';
      if (!d.moved) {
        this.tap(d, e);
        return;
      }
      const at = this.dropTarget(e.clientX, e.clientY);
      if (d.lifted) {
        if (at && this.reinsert(d.lifted, at)) this.onEdit('move', d.lifted);
        else { this.sound?.play('remove'); this.render(); this.onEdit('remove', d.lifted); }
      } else if (at && d.op) {
        this.insert(d.op, at);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      document.body.classList.remove('dragging');
      this.ghost.className = 'ghost hidden';
      if (d.lifted) { this.reinsert(d.lifted, this.caret); this.onEdit('move', d.lifted); }
    });
    this.stripsEl.addEventListener('click', (e) => {
      const cnt = e.target.closest('.rcount');
      if (cnt) this.bumpCount(Number(cnt.dataset.count), 1);
    });
    // Keyboard activation of tiles (Enter/Space on a focused tile).
    this.paletteEl.addEventListener('keydown', (e) => {
      const pal = e.target.closest('.ptile');
      if (pal && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); this.insert(pal.dataset.op); }
    });
    this.stripsEl.addEventListener('keydown', (e) => {
      const tl = e.target.closest('.tile');
      if (tl && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.stopPropagation();
        const uid = Number(tl.dataset.uid);
        if (this.brush) this.paint(uid, this.brush); else this.remove(uid);
      }
    });
  }

  tap(d) {
    if (d.op) { this.insert(d.op); return; }
    if (d.uid != null) {
      if (this.brush) this.paint(d.uid, this.brush);
      else this.remove(d.uid);
      return;
    }
    if (d.slot) {
      const strip = d.slot.dataset.strip || d.slot.closest('.strip')?.dataset.strip;
      if (!strip) return;
      const blockAttr = d.slot.classList.contains('rbody') ? d.slot.dataset.block : '';
      const block = blockAttr ? Number(blockAttr) : null;
      this.caret = { strip, block, index: this.list(strip, block).length };
      this.sound?.play('click');
      this.render();
    }
  }

  reinsert(t, at) {
    if (this.used(at.strip) + countTiles([t]) > this.limit(at.strip)) { this.bump(at.strip); return false; }
    if (this.depthOf(at.strip, at.block) + nestDepthOf(t) > MAX_NEST) return false;
    if (t.op === '1' && at.strip === 'p1' && !this.level.ops.includes('^')) return false;
    if (containsCall(t) && at.strip === 'p1' && !this.level.ops.includes('^')) return false;
    const list = this.list(at.strip, at.block);
    const idx = Math.min(at.index, list.length);
    const list2 = this.list(at.strip, at.block);
    list2.splice(Math.min(idx, list2.length), 0, t);
    this.caret = { strip: at.strip, block: at.block, index: Math.min(idx, list2.length - 1) + 1 };
    this.sound?.play('place', { n: this.used(at.strip) });
    this.render();
    this.pop(t.uid);
    return true;
  }

  // Where would a drop at (x, y) land? Returns a caret or null.
  dropTarget(x, y) {
    this.ghost.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    this.ghost.style.visibility = '';
    if (!el) return null;
    const strip = el.closest('.strip');
    if (!strip) return null;
    const stripId = strip.dataset.strip;
    const tl = el.closest('.strip .tile:not(.rhead)');
    if (tl) {
      const uid = Number(tl.dataset.uid);
      const f = findTile(this.prog[stripId], uid);
      if (!f) return null;
      const r = tl.getBoundingClientRect();
      const after = x > r.left + r.width / 2;
      return { strip: stripId, block: f.parent, index: f.index + (after ? 1 : 0) };
    }
    const head = el.closest('.rhead, .rcount');
    if (head) {
      const uid = Number(head.dataset.uid || head.dataset.count);
      const f = findTile(this.prog[stripId], uid);
      if (f) return { strip: stripId, block: f.parent, index: f.index };
    }
    // The body, or the frame around it: both mean "at the end of this
    // Repeat". The frame matters on touch, where a finger near the last tile
    // easily lands on the padding.
    const blk = el.closest('.rbody, .rblock');
    const rbody = blk && (blk.classList.contains('rbody') ? blk : blk.querySelector(':scope > .rbody'));
    if (rbody) {
      const block = Number(rbody.dataset.block);
      return { strip: stripId, block, index: this.list(stripId, block).length };
    }
    return { strip: stripId, block: null, index: this.prog[stripId].length };
  }
}

function findTile(list, uid, parent = null) {
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.uid === uid) return { tile: t, index: i, parent };
    if (t.op === '@') {
      const f = findTile(t.body, uid, t.uid);
      if (f) return f;
    }
  }
  return null;
}

function findAny(prog, uid) {
  for (const strip of ['main', 'p1']) {
    const f = findTile(prog[strip], uid);
    if (f) return { ...f, strip };
  }
  return null;
}

function nestDepthOf(t) {
  if (t.op !== '@') return 0;
  let d = 0;
  for (const c of t.body) d = Math.max(d, nestDepthOf(c));
  return d + 1;
}

function containsCall(t) {
  return t.op === '1' || (t.op === '@' && t.body.some(containsCall));
}

export { findTile, findAny, nextUid };
