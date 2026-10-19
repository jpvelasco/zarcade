// Pointer and keyboard input for the map: drag to pan, pinch or wheel to
// zoom, tap to pick, held keys to pan, and one-shot key presses.
export class Input {
  constructor(canvas, { onTap, onPan, onZoom, onHover }) {
    this.canvas = canvas;
    this.enabled = true;
    this.pointers = new Map();
    this.held = new Set();
    this.pressed = [];
    this.dragging = false;
    this.pinch = null;
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.cb = { onTap, onPan, onZoom, onHover };

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004);
      this.cb.onZoom(f, e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.repeat && !PAN_KEYS.has(e.code)) return;
      this.held.add(e.code);
      if (!e.repeat) this.pressed.push(e);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => { this.held.clear(); this.pointers.clear(); this.pinch = null; });
  }

  down(e) {
    if (!this.enabled) return;
    this.mode = e.pointerType === 'touch' ? 'touch' : 'mouse';
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      for (const p of this.pointers.values()) p.moved = true;
    }
  }

  move(e) {
    if (e.pointerType === 'mouse') this.cb.onHover?.(e.clientX, e.clientY);
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      if (this.pinch.d > 0) this.cb.onZoom(d / this.pinch.d, cx, cy);
      this.cb.onPan(cx - this.pinch.cx, cy - this.pinch.cy);
      this.pinch = { d, cx, cy };
      return;
    }
    if (!p.moved && Math.hypot(p.x - p.x0, p.y - p.y0) > (e.pointerType === 'touch' ? 10 : 6)) p.moved = true;
    if (p.moved) {
      this.dragging = true;
      this.cb.onPan(dx, dy);
    }
  }

  up(e, cancel = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.dragging = false;
    if (!cancel && !p.moved && this.enabled && performance.now() - p.t0 < 900) this.cb.onTap(e.clientX, e.clientY, e.pointerType);
  }

  // Pan direction from held keys.
  panAxis() {
    const h = this.held;
    return {
      x: (h.has('ArrowRight') || h.has('KeyD') ? 1 : 0) - (h.has('ArrowLeft') || h.has('KeyA') ? 1 : 0),
      y: (h.has('ArrowDown') || h.has('KeyS') ? 1 : 0) - (h.has('ArrowUp') || h.has('KeyW') ? 1 : 0),
    };
  }

  takePresses() {
    const list = this.pressed;
    this.pressed = [];
    return list;
  }

  clear() {
    this.held.clear();
    this.pressed.length = 0;
  }
}

const PAN_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
