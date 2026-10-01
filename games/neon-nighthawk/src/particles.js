// A capped particle pool for sparkles, confetti and fireworks. Renderer-side
// only: particles are decoration and never feed back into the simulation.
// DOM-free so tests can check the cap and lifetimes.

export class Particles {
  constructor(limit = 200) {
    this.limit = limit;
    this.items = [];
    this.cursor = 0;
  }

  setLimit(limit) {
    this.limit = Math.max(0, limit | 0);
    if (this.items.length > this.limit) this.items.length = this.limit;
    this.cursor %= Math.max(1, this.limit);
  }

  get count() {
    return this.items.length;
  }

  // When the pool is full the oldest slot is reused, so a burst never grows
  // the work beyond the cap.
  spawn(particle) {
    if (this.limit <= 0) return null;
    const p = {
      x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.6, size: 6, color: '#ffffff',
      drag: 2, gravity: 0, kind: 'glow', spin: 0, angle: 0, screen: false,
      ...particle,
    };
    if (this.items.length < this.limit) this.items.push(p);
    else {
      this.items[this.cursor] = p;
      this.cursor = (this.cursor + 1) % this.limit;
    }
    return p;
  }

  update(dt) {
    let write = 0;
    for (let read = 0; read < this.items.length; read++) {
      const p = this.items[read];
      p.age += dt;
      if (p.age >= p.life) continue;
      const damping = Math.exp(-p.drag * dt);
      p.vx *= damping;
      p.vy = p.vy * damping + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      this.items[write++] = p;
    }
    this.items.length = write;
    if (this.cursor >= Math.max(1, write)) this.cursor = 0;
  }

  clear() {
    this.items.length = 0;
    this.cursor = 0;
  }
}

// Evenly spread burst directions with a little seeded jitter.
export function burst(count, speed, random = Math.random) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.6;
    const v = speed * (0.55 + random() * 0.6);
    out.push({ vx: Math.cos(angle) * v, vy: Math.sin(angle) * v });
  }
  return out;
}
