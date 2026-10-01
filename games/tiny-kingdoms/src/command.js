// Selection and send commands shared by mouse, touch, keyboard and gamepad.
// DOM-free: callers pass node ids (or null for empty ground) and get back
// sends to perform: { from: [ids], to: id }.

export class Commander {
  constructor(world, owner = 1) {
    this.world = world;
    this.owner = owner;
    this.selected = new Set();
    this.drag = null; // { origin, moved, over }
  }

  own(id) {
    return id != null && this.world.nodes[id]?.owner === this.owner;
  }

  // Drop buildings we no longer own.
  prune() {
    for (const id of this.selected) if (!this.own(id)) this.selected.delete(id);
    if (this.drag && this.drag.origin != null && !this.own(this.drag.origin) && !this.selected.size) this.drag = null;
  }

  clear() {
    this.selected.clear();
    this.drag = null;
  }

  selectAll() {
    this.selected = new Set(this.world.nodes.filter((n) => n.owner === this.owner).map((n) => n.id));
  }

  sendTo(to) {
    const from = [...this.selected].filter((id) => id !== to && this.own(id));
    if (!from.length) return null;
    this.selected.clear();
    return { from, to };
  }

  // Pointer pressed on a building (or null for ground).
  down(id) {
    const prev = new Set(this.selected);
    if (this.own(id)) {
      // Pressing starts a drag from here; a plain tap restores `prev` first.
      if (!this.selected.has(id)) this.selected = new Set([id]);
      this.drag = { origin: id, moved: false, over: id, prev };
    } else {
      this.drag = { origin: null, moved: false, over: id, prev };
    }
  }

  // Pointer moved; `moved` is true once it has travelled far enough to be a drag.
  move(id, moved = true) {
    const d = this.drag;
    if (!d) return;
    if (moved) d.moved = true;
    d.over = id;
    if (d.moved && d.origin != null && this.own(id)) this.selected.add(id);
  }

  // Pointer released. Returns a send or null.
  up(id) {
    const d = this.drag;
    this.drag = null;
    if (!d) return null;
    if (!d.moved) {
      this.selected = d.prev;
      return this.tap(id);
    }
    if (d.origin == null) return null; // a pan over the ground: ignore
    if (id == null) return null; // let go on the water: keep the selection
    if (id === d.origin && this.selected.size <= 1) return null;
    return this.sendTo(id);
  }

  // A tap (or Enter / A on the cursor).
  tap(id) {
    if (id == null) { this.clear(); return null; }
    const mine = this.own(id);
    if (this.selected.size === 0) {
      if (mine) this.selected.add(id);
      return null;
    }
    if (this.selected.has(id)) {
      this.selected.delete(id);
      return null;
    }
    return this.sendTo(id);
  }

  // Keyboard: a building's letter. Your own buildings toggle as sources;
  // any other building is the target. Shift+letter sends to your own.
  letter(id, shift = false) {
    if (id == null) return null;
    if (this.own(id) && !(shift && this.selected.size && !this.selected.has(id))) {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      return null;
    }
    if (!this.selected.size) return null;
    return this.sendTo(id);
  }

  // Keyboard: your n-th building (1-based, in letter order).
  number(n, order) {
    const mine = order.filter((id) => this.own(id));
    const id = mine[n - 1];
    if (id == null) return null;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    return id;
  }
}
