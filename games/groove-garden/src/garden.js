// The garden that grows with your playing: which plants stand where, and how
// far each has grown. Rendering only reads this. DOM-free.
import { WEIGHT } from './score.js';

/** Small seeded RNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const PLANT_KINDS = ['daisy', 'tulip', 'sunflower', 'bell', 'rose', 'lupin'];

/**
 * A deterministic bed of plants for a song. Plants sit along the bottom
 * edge, to either side of the lanes (x in 0..1 across the screen, `side`
 * -1 left of the lanes, 1 right). Each blooms once the garden's growth
 * passes its threshold, spread out so the garden fills in as you play.
 */
export function plantGarden(seed, count = 20) {
  const r = rng(typeof seed === 'string' ? hashString(seed) : seed);
  const plants = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    plants.push({
      id: i,
      side,
      x: r(),
      depth: r(),
      kind: PLANT_KINDS[Math.floor(r() * PLANT_KINDS.length)],
      hue: Math.floor(r() * 6),
      size: 0.75 + r() * 0.5,
      phase: r() * Math.PI * 2,
      threshold: 0,
      grow: 0,
    });
  }
  // Thresholds evenly from 2% to 92%, dealt out in a shuffled order.
  const order = plants.map((p) => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((id, k) => { plants[id].threshold = 0.02 + (0.9 * k) / Math.max(1, count - 1); });
  return plants;
}

/**
 * Growth tracks good playing: every hit adds its weight, misses add
 * nothing, and nothing ever wilts. A whole song played at S accuracy
 * fills the garden.
 */
export class Garden {
  constructor(seed, totalJudgements, count = 28) {
    this.plants = plantGarden(seed, count);
    this.total = Math.max(1, totalJudgements);
    this.growth = 0;
    this.combo = 0;
    this.glow = 1;
    this.opened = new Set();
  }

  /** Feed a Session's judgement events. */
  handle(events, session) {
    for (const ev of events) {
      if (ev.type !== 'hit' && ev.type !== 'tail') continue;
      this.growth += WEIGHT[ev.judgement];
    }
    if (session) {
      this.combo = session.combo;
      this.glow = session.glow;
    }
  }

  get bloom() {
    return Math.min(1, this.growth / (this.total * 0.92));
  }

  /** How much the flowers dance: builds with the combo. */
  get dance() {
    return Math.min(1, this.combo / 30);
  }

  /** Ease each plant towards its target; returns plants that just opened. */
  update(dt) {
    const bloom = this.bloom;
    const opened = [];
    for (const p of this.plants) {
      const target = bloom >= p.threshold ? 1 : 0;
      if (target && !this.opened.has(p.id)) {
        this.opened.add(p.id);
        opened.push(p);
      }
      if (this.opened.has(p.id)) p.grow = Math.min(1, p.grow + dt * 1.6);
    }
    return opened;
  }

  get openCount() {
    return this.opened.size;
  }
}
