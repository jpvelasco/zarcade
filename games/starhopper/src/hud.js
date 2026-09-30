import * as THREE from 'three';
import { LANE } from './entities.js';

const $ = (id) => document.getElementById(id);
const RADAR_RANGE = 600;

const PICKUP_TOASTS = {
  power: '⚡ Cannon power up!', shield: '🛡️ Shields charged', repair: '🔧 Hull repaired', missiles: '🚀 +4 missiles',
};

// Cockpit overlay: bars, cannon level, radar, lock bracket, boss bar, toasts.
export class Hud {
  constructor() {
    this.el = {
      root: $('hud'), planet: $('hud-planet'), progress: $('hud-progress'), score: $('hud-score'), dust: $('hud-dust'),
      hull: $('hud-hull'), shield: $('hud-shield'), boost: $('hud-boost'), cannon: $('hud-cannon'), missiles: $('hud-missiles'),
      center: $('hud-center'), toast: $('hud-toast'), combo: $('hud-combo'), lock: $('hud-lock'), boss: $('hud-boss'),
      bossFill: $('hud-boss-fill'), flash: $('hud-flash'), radar: $('hud-radar'), reticle: $('hud-reticle'),
    };
    this.radar = this.el.radar.getContext('2d');
    this.cache = {};
    this.toastTimer = 0;
    this.comboTimer = 0;
    this.bigTimer = 0;
    this.v = new THREE.Vector3();
  }

  set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  show(on) { this.el.root.classList.toggle('hidden', !on); }

  reset(world) {
    this.cache = {};
    this.el.planet.textContent = `→ ${world.planet.name}`;
    this.big('');
    this.toast('');
  }

  toast(text, seconds = 1.8) {
    this.el.toast.textContent = text;
    this.el.toast.classList.toggle('show', !!text);
    this.toastTimer = text ? seconds : 0;
  }

  big(html, seconds = 2) {
    this.el.center.innerHTML = html ? `<div class="pop">${html}</div>` : '';
    this.bigTimer = html ? seconds : 0;
  }

  handleEvents(events, world) {
    for (const e of events) {
      switch (e.type) {
        case 'launch': this.big(`LAUNCH!<small>Next stop: ${world.planet.name}</small>`, 1.6); break;
        case 'explode':
          if (e.combo > 1) {
            this.el.combo.textContent = `COMBO ×${e.combo}`;
            this.el.combo.classList.remove('show');
            void this.el.combo.offsetWidth;
            this.el.combo.classList.add('show');
            this.comboTimer = 1.2;
          }
          break;
        case 'pickup': if (PICKUP_TOASTS[e.kind]) this.toast(PICKUP_TOASTS[e.kind]); break;
        case 'incoming':
          this.toast({ squadron: '⚠️ Armada squadron incoming!', ghosts: '👻 Ghost ships… shoot them while they glow', cruiser: '⚠️ Cruiser ahead! Take out its turrets' }[e.kind], 2.2);
          break;
        case 'hurt':
          this.el.flash.className = e.shielded ? 'flash shield' : 'flash hull';
          void this.el.flash.offsetWidth;
          this.el.flash.classList.add('go');
          break;
        case 'deflect': this.toast('🌀 Deflected!', 0.8); break;
        case 'hyperStart': this.big('HYPERSPACE!', 1.5); break;
        case 'hyperFizzle': this.toast('✨ +15 stardust'); break;
        case 'missedBurger': this.toast('🍔 Missed the drive-thru!', 2); break;
        case 'bossWarning': this.big('⚠️ WARNING<small>Armada battleship guarding the planet</small>', 2.6); break;
        case 'coreExposed': this.toast('💥 Core exposed! Hit the glowing center', 2.4); break;
        case 'bossDown': this.big('VICTORY!', 3); break;
      }
    }
  }

  update(world, view, dt) {
    const p = world.player, el = this.el;
    const j = world.journey;
    this.set('progress', Math.round(Math.min(1, p.s / j.length) * 1000) / 10, (x) => { el.progress.style.width = `${x}%`; });
    this.set('score', p.score, (x) => { el.score.textContent = x.toLocaleString(); });
    this.set('dust', p.dust, (x) => { el.dust.textContent = x; });
    this.set('hull', Math.round((p.hull / p.maxHull) * 100), (x) => { el.hull.style.width = `${x}%`; el.hull.classList.toggle('low', x < 30); });
    this.set('shield', Math.round((p.shield / p.maxShield) * 100), (x) => { el.shield.style.width = `${x}%`; });
    this.set('boost', Math.round(p.boost * 100), (x) => { el.boost.style.width = `${x}%`; });
    this.set('cannon', p.cannon, (x) => { el.cannon.innerHTML = `⚡ Cannons <b>${'▮'.repeat(x)}${'▯'.repeat(4 - x)}</b>`; });
    this.set('missiles', p.missiles, (x) => { el.missiles.innerHTML = `🚀 Missiles <b>${x}</b>`; });

    // Boss health.
    const b = world.boss;
    const bossOn = b && b.phase !== 'arrive' && b.phase !== 'dead';
    this.set('bossOn', !!bossOn, (on) => el.boss.classList.toggle('hidden', !on));
    if (bossOn) {
      const parts = [...b.parts, b.core];
      const hp = parts.reduce((s, e) => s + Math.max(0, e.alive ? e.hp : 0), 0);
      const max = parts.reduce((s, e) => s + e.maxHp, 0);
      this.set('bossHp', Math.round((hp / max) * 100), (x) => { el.bossFill.style.width = `${x}%`; });
    }

    // The reticle marks where your shots go: 70 m straight ahead of the jet.
    if (view) {
      const aim = world.lane.toWorld(p.s + 70, p.u, p.w - 0.3);
      this.v.set(aim.x, aim.y, aim.z).project(view.camera);
      const x = Math.round((this.v.x * 0.5 + 0.5) * innerWidth), y = Math.round((-this.v.y * 0.5 + 0.5) * innerHeight);
      this.set('reticle', `${x},${y}`, () => { el.reticle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; });
    }

    // Lock bracket over the targeted enemy.
    const lock = p.lock;
    if (lock && view) {
      const pos = world.lane.toWorld(lock.s, lock.u, lock.w);
      this.v.set(pos.x, pos.y, pos.z).project(view.camera);
      const on = this.v.z < 1;
      el.lock.style.display = on ? 'block' : 'none';
      if (on) el.lock.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px, ${(-this.v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    } else {
      el.lock.style.display = 'none';
    }

    this.drawRadar(world);

    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toast('');
    if (this.comboTimer > 0 && (this.comboTimer -= dt) <= 0) el.combo.classList.remove('show');
    if (this.bigTimer > 0 && (this.bigTimer -= dt) <= 0) this.big('');
  }

  // Top-down radar of the lane ahead: sideways across, distance up.
  drawRadar(world) {
    const c = this.radar, W = c.canvas.width, H = c.canvas.height, p = world.player;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10, 20, 40, 0.55)';
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(120, 200, 255, 0.35)';
    c.lineWidth = 1.5;
    for (const r of [0.33, 0.66, 1]) { c.beginPath(); c.arc(W / 2, H * 0.82, (H * 0.78) * r, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
    const toXY = (s, u) => [W / 2 + (u - p.u) / (LANE.halfU * 2.4) * W, H * 0.82 - ((s - p.s) / RADAR_RANGE) * H * 0.78];
    const dot = (s, u, color, r = 3) => {
      if (s < p.s - 40 || s > p.s + RADAR_RANGE) return;
      const [x, y] = toXY(s, u);
      if ((x - W / 2) ** 2 + (y - H / 2) ** 2 > (W / 2 - 4) ** 2) return;
      c.fillStyle = color;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const o of world.statics) if (o.alive) dot(o.s, o.u, o.kind === 'mine' ? '#ff7a5a' : 'rgba(200,190,180,0.7)', o.kind === 'asteroid' ? 1 + o.size : 2.5);
    for (const k of world.pickups) if (k.alive && k.type !== 'dust') dot(k.s, k.u, '#ffe07a', 3);
    const b = world.journey.burger;
    if (!p.burgerDone) dot(b.s, b.u, '#ff7ad8', 5);
    for (const e of world.enemies) if (e.alive && (e.kind !== 'ghost' || e.visible)) dot(e.s, e.u, e.kind === 'cruiser' ? '#ff9a3a' : '#ff4a5a', e.kind === 'cruiser' ? 6 : 3);
    const [px, py] = toXY(p.s, p.u);
    c.fillStyle = '#7fffd0';
    c.beginPath();
    c.moveTo(px, py - 6); c.lineTo(px - 5, py + 4); c.lineTo(px + 5, py + 4); c.closePath();
    c.fill();
  }
}
