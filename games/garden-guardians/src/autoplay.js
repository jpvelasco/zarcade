// A simple scripted player: plants from a fixed shopping list at the tiles
// that cover the most path, and upgrades between purchases. Used by the
// balance tests, the title screen's attract mode and `?autoplay`.
import { DEFENDERS } from './data.js';
import { buildCost, upgradeCost } from './combat.js';
import { Game, STEP } from './game.js';
import { hasFlyers } from './waves.js';

const PLAN = ['pea', 'sunflower', 'pea', 'honey', 'daisy', 'sunflower', 'thistle', 'mage', 'pea', 'lavender', 'sunflower', 'thistle', 'mage', 'honey', 'pea', 'mage', 'lavender'];

function samples(route, step = 0.25) {
  const pts = [];
  const { points, cum } = route;
  for (let d = 0; d <= route.length; d += step) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const a = points[i - 1], b = points[i];
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return pts;
}

export class AutoPlayer {
  constructor(game, { build = true, callEarly = false } = {}) {
    this.game = game;
    this.enabled = build;
    this.callEarly = callEarly;
    this.planIndex = 0;
    this.buildsSinceUpgrade = 0;
    this.think = 0;
    const ground = game.info.routes.flatMap((r) => samples(r));
    const air = game.info.flyRoutes.flatMap((r) => samples(r));
    const cover = (tile, pts, range) => pts.filter((p) => (p.x - tile.x - 0.5) ** 2 + (p.y - tile.y - 0.5) ** 2 <= range * range).length;
    this.tiles = game.info.buildable.map((t) => ({ ...t, ground: cover(t, ground, 2.6), air: cover(t, air, 3.4) }));
  }

  plan() {
    return PLAN.filter((t) => this.game.unlocked.has(t));
  }

  bestTile(type) {
    const g = this.game;
    const free = this.tiles.filter((t) => g.canBuildAt(t.x, t.y));
    if (!free.length) return null;
    let score;
    if (type === 'thistle') score = (t) => t.air * 2 + t.ground * 0.1;
    else if (type === 'daisy') score = (t) => -t.ground;
    else if (type === 'lavender') {
      score = (t) => g.defenders.filter((d) => d.type !== 'daisy' && d.type !== 'lavender' && Math.hypot(d.x - t.x - 0.5, d.y - t.y - 0.5) <= 1.6).length * 100 + t.ground;
    } else score = (t) => t.ground + (DEFENDERS[type].air ? t.air * 0.2 : 0);
    return free.reduce((best, t) => (score(t) > score(best) ? t : best));
  }

  update() {
    const g = this.game;
    if (g.over) return;
    if (this.enabled && --this.think <= 0) {
      this.think = 15;
      this.act();
    }
    if (g.status === 'ready' && (g.defenders.length || !this.enabled)) g.startWave();
    if (this.callEarly && g.canCallWave() && g.status === 'playing' && !g.bugs.length) g.startWave();
  }

  act() {
    const g = this.game;
    const plan = this.plan();
    // Every third purchase is an upgrade once a few defenders are down.
    if (g.defenders.length >= 4 && this.buildsSinceUpgrade >= 2) {
      const upg = g.defenders
        .filter((d) => upgradeCost(d.type, d.tier) !== null && d.type !== 'daisy')
        .sort((a, b) => a.tier - b.tier || this.tileScore(b) - this.tileScore(a))[0];
      if (upg) {
        if (g.upgrade(upg)) this.buildsSinceUpgrade = 0;
        return;
      }
    }
    let type = plan[this.planIndex % plan.length];
    // React to flyers: get one anti-air plant as soon as they show up.
    const flyersSoon = g.bugs.some((b) => b.flying) || (g.nextWave && hasFlyers(g.nextWave));
    const antiAir = g.defenders.filter((d) => d.type === 'thistle').length;
    const forced = flyersSoon && g.unlocked.has('thistle') && antiAir < 1 + Math.floor(g.wave / 6);
    if (forced) type = 'thistle';
    if (g.coins < buildCost(type)) return;
    const tile = this.bestTile(type);
    if (tile && g.build(type, tile.x, tile.y)) {
      if (!forced) this.planIndex++;
      this.buildsSinceUpgrade++;
    } else {
      this.buildsSinceUpgrade = 2; // board full: spend on upgrades
    }
  }

  tileScore(d) {
    const t = this.tiles.find((t) => t.x === d.cx && t.y === d.cy);
    return t ? t.ground + t.air : 0;
  }
}

// Run a whole map headlessly. Returns the finished game.
export function simulate(mapIndex, options = {}) {
  const game = new Game(mapIndex, { recordEvents: false, unlocked: options.unlocked });
  const bot = new AutoPlayer(game, options);
  const maxSteps = options.maxSteps ?? 60 * 60 * 30;
  for (let i = 0; i < maxSteps && !game.over; i++) {
    bot.update();
    game.step(STEP);
  }
  return game;
}
