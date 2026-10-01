// The level editor: paint a board, choose tiles and limits, then test it.
// Solving your own level sets its par, which unlocks sharing.
import { parseLevel, levelRows, DIRS, MAX_SIZE } from './rules.js';
import { ICON, TILE_INFO } from './icons.js';
import { cleanName } from './code.js';

export const TOOLS = [
  { id: 'raise', icon: '⬆️', label: 'Raise', key: '1' },
  { id: 'lower', icon: '⬇️', label: 'Lower', key: '2' },
  { id: 'erase', icon: '🧽', label: 'Erase', key: '3' },
  { id: 'lamp', icon: '💡', label: 'Lamp', key: '4' },
  { id: 'battery', icon: '🔋', label: 'Battery', key: '5' },
  { id: 'red', icon: '🔴', label: 'Red', key: '6' },
  { id: 'blue', icon: '🔷', label: 'Blue', key: '7' },
  { id: 'plain', icon: '⬜', label: 'Plain', key: '8' },
  { id: 'bolt', icon: '🤖', label: 'Bolt', key: '9' },
];
const OPS = ['L', 'R', 'J', '*', 'G', '@', '1', '^', 'c'];
const OP_LABEL = { '^': 'P1 may call P1', c: 'Colour brushes' };

export function blankDraft() {
  const w = 5;
  const h = 5;
  const cells = [];
  for (let i = 0; i < w * h; i++) cells.push({ h: 0, c: '', item: '' });
  cells[w * h - 1].item = 'L';
  return { w, h, cells, start: { x: 0, y: 0, d: 1 }, ops: new Set(['L', 'R', '*']), main: 10, p1: 0, name: '', par: null, slot: -1 };
}

export function draftFromDef(def, slot = -1) {
  const lv = parseLevel(def);
  return {
    w: lv.w,
    h: lv.h,
    cells: lv.cells.map((c) => (c ? { ...c } : null)),
    start: { ...lv.start },
    ops: new Set([...lv.ops].filter((o) => o !== 'F')),
    main: lv.limits.main,
    p1: lv.limits.p1,
    name: def.name || '',
    par: def.par && def.par < 99 ? def.par : null,
    slot,
  };
}

export function draftToDef(d) {
  const rows = levelRows({ w: d.w, h: d.h, cells: d.cells });
  let ops = `F${[...d.ops].join('')}`;
  const hasLamp = d.cells.some((c) => c && c.item === 'L');
  const hasBat = d.cells.some((c) => c && c.item === 'B');
  if (hasLamp && !ops.includes('*')) ops += '*';
  if (hasBat && !ops.includes('G')) ops += 'G';
  if (d.p1 > 0 && !ops.includes('1')) ops += '1';
  return {
    id: 'my-level',
    name: cleanName(d.name) || 'My level',
    map: rows,
    start: [d.start.x, d.start.y, DIRS[d.start.d]],
    ops,
    limits: { main: d.main, p1: ops.includes('1') ? Math.max(1, d.p1) : 0 },
    par: d.par || 99,
    custom: true,
    mine: true,
  };
}

// Apply a tool to a cell. Returns true when something changed.
export function applyTool(d, tool, x, y) {
  if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
  const i = y * d.w + x;
  const c = d.cells[i];
  const isStart = d.start.x === x && d.start.y === y;
  const make = () => (d.cells[i] = d.cells[i] || { h: 0, c: '', item: '' });
  switch (tool) {
    case 'raise':
      if (!c) { make(); return true; }
      if (c.h >= 4) return false;
      c.h++;
      return true;
    case 'lower':
      if (!c) return false;
      if (c.h > 0) { c.h--; return true; }
      if (isStart) return false;
      d.cells[i] = null;
      return true;
    case 'erase':
      if (!c || isStart) return false;
      d.cells[i] = null;
      return true;
    case 'lamp':
    case 'battery': {
      const want = tool === 'lamp' ? 'L' : 'B';
      const cell = make();
      cell.item = cell.item === want ? '' : want;
      return true;
    }
    case 'red':
    case 'blue': {
      const want = tool === 'red' ? 'r' : 'b';
      const cell = make();
      cell.c = cell.c === want ? '' : want;
      return true;
    }
    case 'plain':
      if (!c || !c.c) return false;
      c.c = '';
      return true;
    case 'bolt':
      make();
      if (isStart) d.start.d = (d.start.d + 1) % 4;
      else { d.start.x = x; d.start.y = y; }
      return true;
    default:
      return false;
  }
}

export function resizeDraft(d, w, h) {
  w = Math.max(2, Math.min(MAX_SIZE, w));
  h = Math.max(2, Math.min(MAX_SIZE, h));
  if (w === d.w && h === d.h) return false;
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) cells.push(x < d.w && y < d.h ? d.cells[y * d.w + x] : null);
  }
  d.w = w;
  d.h = h;
  d.cells = cells;
  d.start.x = Math.min(d.start.x, w - 1);
  d.start.y = Math.min(d.start.y, h - 1);
  const si = d.start.y * w + d.start.x;
  if (!cells[si]) cells[si] = { h: 0, c: '', item: '' };
  return true;
}

// What would stop this draft from being a playable level?
export function draftProblem(d) {
  if (!d.cells.some((c) => c && c.item)) return 'Add a lamp or a battery for Bolt.';
  return '';
}

export class Editor {
  constructor({ root, renderer, sound, onTest, onShare, onBack, onMine, onChange }) {
    this.root = root;
    this.renderer = renderer;
    this.sound = sound;
    this.cb = { onTest, onShare, onBack, onMine, onChange };
    this.draft = blankDraft();
    this.tool = 'raise';
    this.cursor = { x: 0, y: 0 };
    this.stroke = null;
    this.$ = (id) => root.querySelector(`#${id}`);
    this.build();
  }

  build() {
    const tools = this.$('ed-tools');
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.innerHTML = `<span class="ti" aria-hidden="true">${t.icon}</span><span class="tl">${t.label}</span>`;
      b.setAttribute('aria-label', `${t.label} tool (${t.key})`);
      b.title = `${t.label} (${t.key})`;
      b.addEventListener('click', () => this.setTool(t.id));
      tools.appendChild(b);
    }
    const ops = this.$('ed-ops');
    for (const op of OPS) {
      const b = document.createElement('button');
      if (op === '^' || op === 'c') {
        b.className = `tile ${op === '^' ? 'op-p1' : 'op-rep'}`;
        b.innerHTML = op === '^'
          ? `${ICON[1]}<kbd>↻</kbd>`
          : '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="11" cy="16" r="7" fill="#ff5a6e"/><path d="M22 9l7 7-7 7-7-7z" fill="#3f8cff"/></svg>';
      } else {
        b.className = `tile op-${op === '*' ? 'L1' : op === '@' ? 'rep' : op === '1' ? 'p1' : op}`;
        b.innerHTML = ICON[op];
      }
      b.dataset.op = op;
      const label = OP_LABEL[op] || TILE_INFO[op].name;
      b.setAttribute('aria-label', `Allow ${label}`);
      b.title = label;
      b.addEventListener('click', () => this.toggleOp(op));
      ops.appendChild(b);
    }
    this.root.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.size;
      const d = this.draft;
      if (resizeDraft(d, d.w + (k === 'w+' ? 1 : k === 'w-' ? -1 : 0), d.h + (k === 'h+' ? 1 : k === 'h-' ? -1 : 0))) this.changed();
    }));
    this.root.querySelectorAll('[data-lim]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.lim;
      const d = this.draft;
      if (k === 'main+') d.main = Math.min(16, d.main + 1);
      if (k === 'main-') d.main = Math.max(1, d.main - 1);
      if (k === 'p1+') { d.p1 = Math.min(12, d.p1 + 1); d.ops.add('1'); }
      if (k === 'p1-') { d.p1 = Math.max(0, d.p1 - 1); if (!d.p1) { d.ops.delete('1'); d.ops.delete('^'); } }
      this.changed();
    }));
    this.$('ed-name').addEventListener('input', (e) => { this.draft.name = e.target.value; this.cb.onChange?.(); });
    this.$('ed-back').addEventListener('click', () => this.cb.onBack());
    this.$('ed-test').addEventListener('click', () => this.test());
    this.$('ed-share').addEventListener('click', () => this.share());
    this.$('ed-new').addEventListener('click', () => { this.open(blankDraft()); this.sound?.play('click'); });
    this.$('ed-mine').addEventListener('click', () => this.cb.onMine());
  }

  open(draft = this.draft) {
    this.draft = draft;
    this.cursor = { x: Math.min(this.cursor.x, draft.w - 1), y: Math.min(this.cursor.y, draft.h - 1) };
    this.$('ed-name').value = draft.name || '';
    this.setTool(this.tool, true);
    this.refresh();
  }

  setTool(id, quiet = false) {
    this.tool = id;
    for (const b of this.root.querySelectorAll('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    if (!quiet) this.sound?.play('click');
  }

  toggleOp(op) {
    const d = this.draft;
    if (d.ops.has(op)) d.ops.delete(op); else d.ops.add(op);
    if (op === '1') { if (d.ops.has('1') && !d.p1) d.p1 = 6; if (!d.ops.has('1')) { d.p1 = 0; d.ops.delete('^'); } }
    if (op === '^' && d.ops.has('^') && !d.ops.has('1')) { d.ops.add('1'); d.p1 = d.p1 || 6; }
    this.sound?.play('click');
    this.changed();
  }

  def() { return draftToDef(this.draft); }
  level() { return parseLevel(this.def()); }

  changed() {
    this.draft.par = null;
    this.refresh();
    this.cb.onChange?.();
  }

  refresh() {
    const d = this.draft;
    this.$('ed-w').textContent = d.w;
    this.$('ed-h').textContent = d.h;
    this.$('ed-main').textContent = d.main;
    this.$('ed-p1').textContent = d.p1;
    for (const b of this.root.querySelectorAll('.ed-ops .tile')) b.setAttribute('aria-pressed', String(d.ops.has(b.dataset.op)));
    const problem = draftProblem(d);
    this.$('ed-status').textContent = problem || (d.par ? `Solved in ${d.par} tiles. Ready to share!` : 'Test it and solve it to set the par.');
    this.$('ed-share').disabled = !d.par || !!problem;
    this.$('ed-test').disabled = !!problem;
    const lv = this.level();
    this.renderer.setLevel(lv, 'custom', 0);
    this.renderer.cursor = this.keyboardCursor ? this.cursor : null;
  }

  test() {
    if (draftProblem(this.draft)) { this.sound?.play('shrug'); return; }
    this.cb.onTest(this.def());
  }

  share() {
    if (!this.draft.par) { this.$('ed-status').textContent = 'Solve your level first, then share it.'; return; }
    this.cb.onShare(this.def());
  }

  // A solved test run sets (or improves) the par.
  solved(tiles) {
    const d = this.draft;
    d.par = d.par ? Math.min(d.par, tiles) : tiles;
  }

  pointerDown(px, py) {
    const cell = this.renderer.pick(px, py);
    this.keyboardCursor = false;
    this.renderer.cursor = null;
    if (!cell) return;
    this.stroke = { tool: this.tool, seen: new Set() };
    this.paintAt(cell);
  }

  pointerMove(px, py) {
    if (!this.stroke) return;
    if (!['erase', 'lamp', 'battery', 'red', 'blue', 'plain', 'raise', 'lower'].includes(this.stroke.tool)) return;
    const cell = this.renderer.pick(px, py);
    if (cell) this.paintAt(cell);
  }

  pointerUp() { this.stroke = null; }

  paintAt(cell) {
    const k = `${cell.x},${cell.y}`;
    if (this.stroke && this.stroke.seen.has(k)) return;
    this.stroke?.seen.add(k);
    if (applyTool(this.draft, this.tool, cell.x, cell.y)) {
      this.sound?.play('place', { n: cell.x + cell.y });
      this.changed();
    } else this.sound?.play('skip');
  }

  key(e) {
    const k = e.key;
    const tool = TOOLS.find((t) => t.key === k);
    if (tool) { this.setTool(tool.id); return true; }
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (move) {
      this.keyboardCursor = true;
      this.cursor.x = Math.max(0, Math.min(this.draft.w - 1, this.cursor.x + move[0]));
      this.cursor.y = Math.max(0, Math.min(this.draft.h - 1, this.cursor.y + move[1]));
      this.renderer.cursor = this.cursor;
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      if (e.target && e.target.closest && e.target.closest('button, input')) return false;
      this.keyboardCursor = true;
      this.renderer.cursor = this.cursor;
      this.stroke = null;
      if (applyTool(this.draft, this.tool, this.cursor.x, this.cursor.y)) { this.sound?.play('place'); this.changed(); }
      return true;
    }
    return false;
  }
}
