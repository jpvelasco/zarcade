import { formatTime, ordinal } from './math.js';
import { driftTier } from './vehicle.js';
import { ELIM_EVERY } from './race.js';

const $ = (id) => document.getElementById(id);

// The race HUD. Writes to the DOM only when a value changes.
export class Hud {
  constructor() {
    this.el = $('hud');
    this.cache = new Map();
    this.toastTimer = 0;
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.tags = [];
    this.lastCount = null;
  }

  set(id, value, prop = 'textContent') {
    const key = id + prop;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    $(id)[prop] = value;
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
  }

  reset(race, view) {
    this.race = race;
    this.view = view;
    this.cache.clear();
    this.lastCount = null;
    this.toastTimer = 0;
    $('hud-toast').classList.remove('show');
    $('hud-center').textContent = '';
    $('hud-wrong').classList.add('hidden');
    $('hud-elim').classList.toggle('hidden', race.kind !== 'elimination');
    this.set('hud-lap-label', race.kind === 'sprint' ? 'SPRINT' : race.kind === 'elimination' ? 'LAP' : 'LAP');
    this.set('hud-pos-of', `/${race.racers.length}`);
    $('hud-standings').innerHTML = '';
    this.rows = race.racers.map((r) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', r.color);
      li.innerHTML = `<span class="p"></span><span>${r.flag}</span><span>${r.name}</span>`;
      if (r.isPlayer) li.classList.add('me');
      $('hud-standings').appendChild(li);
      return li;
    });
    $('hud-standings').classList.toggle('hidden', race.racers.length < 2);
    $('labels').innerHTML = '';
    this.tags = race.racers.filter((r) => !r.isPlayer).map((r) => {
      const d = document.createElement('div');
      d.className = 'tag';
      d.style.setProperty('--c', r.color);
      d.textContent = `${r.flag} ${r.name}`;
      d.style.display = 'none';
      $('labels').appendChild(d);
      return { r, d, shown: false };
    });
    this.bakeMinimap(race.track);
  }

  bakeMinimap(track) {
    const size = 200, pad = 18;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (size - (maxX - minX) * scale) / 2, oz = (size - (maxZ - minZ) * scale) / 2;
    // Seen from above: +x right, +z down, matching the 3D view.
    this.map = (x, z) => [ox + (x - minX) * scale, oz + (z - minZ) * scale];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.lineJoin = g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      track.samples.forEach((s, i) => { const [x, y] = this.map(s.x, s.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      if (track.closed) g.closePath();
    };
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 10; path(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 5; path(); g.stroke();
    for (const sc of track.shortcuts) {
      g.strokeStyle = 'rgba(255,210,61,0.8)'; g.lineWidth = 3; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(...this.map(sc.ax, sc.az)); g.lineTo(...this.map(sc.bx, sc.bz)); g.stroke();
      g.setLineDash([]);
    }
    const s = track.pointAt(track.startDist);
    const [sx, sy] = this.map(s.x, s.z);
    g.fillStyle = '#ffffff'; g.fillRect(sx - 5, sy - 5, 10, 10);
    g.fillStyle = '#111'; g.fillRect(sx - 5, sy - 5, 5, 5); g.fillRect(sx, sy, 5, 5);
    if (!track.closed) {
      const f = track.pointAt(track.finishDist);
      const [fx, fy] = this.map(f.x, f.z);
      g.font = '16px sans-serif'; g.fillText('🏁', fx - 8, fy + 6);
    }
    this.mapBg = c;
  }

  drawMinimap(race) {
    const g = this.mctx;
    g.clearRect(0, 0, 200, 200);
    g.drawImage(this.mapBg, 0, 0);
    for (const r of race.racers) {
      if (r.eliminated) continue;
      const [x, y] = this.map(r.vehicle.x, r.vehicle.z);
      g.fillStyle = r.color;
      g.beginPath();
      g.arc(x, y, r.isPlayer ? 7 : 5, 0, Math.PI * 2);
      g.fill();
      if (r.isPlayer) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); }
    }
    const ghost = race.ghostPose();
    if (ghost) {
      const [x, y] = this.map(ghost.x, ghost.z);
      g.fillStyle = 'rgba(159,232,255,0.7)';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
  }

  toast(text, seconds = 1.6) {
    const t = $('hud-toast');
    t.textContent = text;
    t.classList.add('show');
    this.toastTimer = seconds;
  }

  center(text) {
    const c = $('hud-center');
    c.textContent = text;
    c.classList.remove('pop');
    void c.offsetWidth;
    if (text) c.classList.add('pop');
  }

  // Returns true on a new countdown number (for the beep).
  countdown(race) {
    if (race.time >= 0) {
      if (this.lastCount !== 0 && this.lastCount !== null) { this.lastCount = 0; this.center('GO!'); this.goTimer = 0.9; }
      return false;
    }
    const n = Math.ceil(-race.time);
    if (n !== this.lastCount && n <= 3) {
      this.lastCount = n;
      this.center(String(n));
      return true;
    }
    return false;
  }

  handleEvents(events, race) {
    const p = race.player;
    for (const e of events) {
      const mine = e.racer === p.id;
      switch (e.type) {
        case 'overtake': this.toast(`Passed ${e.name}! ${ordinal(e.position)}`); break;
        case 'turbo': if (mine) this.toast(['', 'Mini-turbo!', 'Super turbo!', 'ULTRA TURBO!'][e.tier], 1); break;
        case 'perfectStart': if (mine) this.toast('Perfect start!'); break;
        case 'slip': this.toast('Slipstream! 💨', 1); break;
        case 'finalLap': this.toast('FINAL LAP!', 2); break;
        case 'lap': if (race.kind === 'timetrial') this.toast(`Lap ${formatTime(e.time)}`, 2); break;
        case 'ghostBest': this.toast('New best lap! 👻', 2); break;
        case 'missed': if (mine) this.toast('Missed a checkpoint! Back you go', 2); break;
        case 'eliminated': this.toast(e.racer === p.id ? 'Eliminated!' : `${e.name} is out!`, 1.8); break;
        case 'land': if (mine && e.air > 0.8) this.toast(`Big air! ${e.air.toFixed(1)}s`, 1.2); break;
        case 'finish': if (mine) this.center(e.place === 1 ? '1st!' : ordinal(e.place)); break;
      }
    }
  }

  update(race, dt) {
    const p = race.player;
    if (this.goTimer > 0) { this.goTimer -= dt; if (this.goTimer <= 0) this.center(''); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) $('hud-toast').classList.remove('show'); }
    const t = race.track;
    if (race.kind === 'sprint') {
      this.set('hud-lap', `${Math.max(0, Math.min(100, Math.round((p.raceDist / race.totalDist) * 100)))}%`);
    } else if (race.kind === 'elimination') {
      this.set('hud-lap', `${Math.max(1, p.lap)}`);
    } else {
      this.set('hud-lap', `${Math.min(race.laps, Math.max(1, p.lap))}/${race.laps}`);
    }
    this.set('hud-time', formatTime(Math.max(0, p.finished ? p.finishTime : race.time)));
    let sub = '';
    if (race.kind === 'timetrial') {
      const cur = p.lap >= 1 && !p.finished ? race.time - p.lapStart : 0;
      sub = `Lap ${formatTime(cur)} · Best ${Number.isFinite(race.bestLap) ? formatTime(race.bestLap) : '--'}`;
    } else if (p.lapTimes.length) sub = `Best lap ${formatTime(p.bestLap)}`;
    this.set('hud-sub', sub);
    this.set('hud-pos', String(p.position));
    this.set('hud-pos-suffix', ordinal(p.position).replace(/\d+/, ''));
    this.set('hud-speed', String(Math.round(Math.max(0, p.vehicle.speed) * 3.6)));
    const meter = Math.round(p.vehicle.meter * 100);
    if (this.cache.get('meter') !== meter) {
      this.cache.set('meter', meter);
      $('hud-boost').style.width = `${meter}%`;
      $('hud-boost').classList.toggle('full', meter >= 99);
    }
    const tier = p.vehicle.drifting ? driftTier(p.vehicle.driftCharge) : 0;
    this.set('hud-drift', `drift t${tier}`, 'className');
    $('hud-wrong').classList.toggle('hidden', !p.wrongWay || p.finished);

    // Standings list.
    const order = race.order;
    order.forEach((r, i) => {
      const li = this.rows[r.id];
      li.style.order = i;
      const pEl = li.firstChild;
      const text = String(i + 1);
      if (pEl.textContent !== text) pEl.textContent = text;
      li.classList.toggle('out', r.eliminated);
      li.classList.toggle('danger', race.kind === 'elimination' && !r.eliminated && i === order.filter((o) => !o.eliminated).length - 1);
    });

    if (race.kind === 'elimination') {
      const left = Math.max(0, race.elimTimer);
      this.set('hud-elim-time', `${Math.ceil(left)}s`);
      $('hud-elim-bar').style.width = `${Math.min(100, (left / ELIM_EVERY) * 100)}%`;
    }
    this.drawMinimap(race);
    this.updateTags(race);
  }

  // Name tags over nearby rivals.
  updateTags(race) {
    const view = this.view;
    if (!view) return;
    const pv = race.player.vehicle;
    const w = window.innerWidth, h = window.innerHeight;
    const fx = Math.sin(pv.heading), fz = Math.cos(pv.heading);
    // The three nearest rivals ahead of the camera get a name tag.
    const near = [];
    for (const tag of this.tags) {
      const v = tag.r.vehicle;
      const dx = v.x - pv.x, dz = v.z - pv.z, d2 = dx * dx + dz * dz;
      tag.want = !tag.r.eliminated && d2 < 60 * 60 && d2 > 9 && dx * fx + dz * fz > 2;
      tag.d2 = d2;
      if (tag.want) near.push(tag);
    }
    near.sort((a, b) => a.d2 - b.d2);
    const pt = {};
    for (const tag of this.tags) {
      let show = tag.want && near.indexOf(tag) < 3;
      const v = tag.r.vehicle;
      if (show && view.project(v.x, v.y + 2.6, v.z, pt)) {
        const x = (pt.x * 0.5 + 0.5) * w, y = (-pt.y * 0.5 + 0.5) * h;
        tag.d.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
      } else show = false;
      if (show !== tag.shown) { tag.shown = show; tag.d.style.display = show ? '' : 'none'; }
    }
  }
}
