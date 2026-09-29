const $ = (id) => document.getElementById(id);

export function formatTime(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

const WEAPON_LABEL = { gun: '🔫 Roof gun', rockets: '🚀 Rockets' };

// The in-race overlay. Only touches the DOM when a value actually changes.
export class Hud {
  constructor() {
    this.el = {
      root: $('hud'), name: $('hud-track-name'), time: $('hud-time'), progress: $('hud-progress'),
      coins: $('hud-coins'), kills: $('hud-kills'), hp: $('hud-hp'), nitro: $('hud-nitro'),
      speed: $('hud-speed'), weapon: $('hud-weapon'), center: $('hud-center'), toast: $('hud-toast'), combo: $('hud-combo'),
    };
    this.cache = {};
    this.toastTimer = 0;
    this.comboTimer = 0;
    this.lastCount = null;
  }

  set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  show(on) {
    this.el.root.classList.toggle('hidden', !on);
  }

  reset(world) {
    this.cache = {};
    this.lastCount = null;
    this.el.name.textContent = world.def.name;
    this.el.center.innerHTML = '';
    this.toast('');
  }

  toast(text, seconds = 1.8) {
    this.el.toast.textContent = text;
    this.el.toast.classList.toggle('show', !!text);
    this.toastTimer = text ? seconds : 0;
  }

  handleEvents(events, world) {
    const pid = world.player.id;
    for (const e of events) {
      if (e.racer !== undefined && e.racer !== pid) continue;
      if (e.type === 'kill' && e.combo > 1) {
        this.el.combo.textContent = `COMBO ×${e.combo}`;
        this.el.combo.classList.remove('show');
        void this.el.combo.offsetWidth; // restart the pop animation
        this.el.combo.classList.add('show');
        this.comboTimer = 1.2;
      } else if (e.type === 'pickup' && e.kind !== 'coin') {
        this.toast({ nitro: '🔥 Nitro!', repair: '🔧 Repaired!', shield: '🛡️ Shield! Smash everything!', gun: '🔫 Roof gun! It aims itself', rockets: '🚀 Rockets! Press Space' }[e.kind]);
      } else if (e.type === 'land' && e.air > 1.1) {
        this.toast(`✈️ Big air! ${e.air.toFixed(1)}s`, 1.2);
      } else if (e.type === 'boundary') {
        this.toast('⚠️ Back to the road!', 1);
      }
    }
  }

  update(world, dt) {
    const p = world.player, v = p.vehicle, t = world.track;
    const el = this.el;

    // Countdown and big messages.
    if (world.time < 0) {
      const n = Math.ceil(-world.time);
      this.set('center', `c${n}`, () => { el.center.innerHTML = `<div class="pop">${n}<small>${world.def.tip}</small></div>`; });
    } else if (world.time < 1) {
      this.set('center', 'go', () => { el.center.innerHTML = '<div class="pop">GO!</div>'; });
    } else if (p.wrongWay > 1) {
      this.set('center', 'wrong', () => { el.center.innerHTML = '<div class="pop" style="font-size:0.45em">↩ Wrong way!</div>'; });
    } else {
      this.set('center', '', () => { el.center.innerHTML = ''; });
    }

    const time = p.finished ? p.finishTime : world.time;
    this.set('time', formatTime(time), (s) => { el.time.textContent = s; });
    const prog = Math.round(Math.max(0, Math.min(1, (p.along - t.startDist) / (t.finishDist - t.startDist))) * 1000) / 10;
    this.set('progress', prog, (x) => { el.progress.style.width = `${x}%`; });
    this.set('coins', p.coins, (x) => { el.coins.textContent = x; });
    this.set('kills', p.kills, (x) => { el.kills.textContent = x; });
    this.set('hp', Math.round(v.hp), (x) => {
      el.hp.style.width = `${x}%`;
      el.hp.classList.toggle('low', x < 30);
    });
    this.set('nitro', Math.round(v.nitro * 100), (x) => { el.nitro.style.width = `${x}%`; });
    this.set('speed', Math.round(Math.abs(v.speed) * 3.6), (x) => { el.speed.textContent = x; });
    const weapon = p.weapon ? `${WEAPON_LABEL[p.weapon]}|${p.ammo}` : p.shield > 0 ? `shield|${Math.ceil(p.shield)}` : '';
    this.set('weapon', weapon, (w) => {
      if (!w) { el.weapon.innerHTML = ''; return; }
      const [label, n] = w.split('|');
      el.weapon.innerHTML = label === 'shield' ? `🛡️ Shield<small>${n}s</small>` : `${label}<small>${n} ${label.includes('Rockets') ? 'left' : 'rounds'}</small>`;
    });

    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toast('');
    if (this.comboTimer > 0 && (this.comboTimer -= dt) <= 0) el.combo.classList.remove('show');
  }

  // Seconds remaining in the countdown, for beeps.
  countdownTick(world) {
    const n = world.time < 0 ? Math.ceil(-world.time) : 0;
    const changed = n !== this.lastCount;
    this.lastCount = n;
    return changed && n > 0 ? n : 0;
  }
}
