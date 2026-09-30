// Moonshot Mini Golf: synthesized sound effects (Web Audio, no files).
(function (root) {
  'use strict';

  class GolfAudio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.last = {};
    }

    unlock() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }

    ok(name, gap = 0.03) {
      if (!this.ctx || this.muted) return false;
      const now = this.ctx.currentTime;
      if (this.last[name] && now - this.last[name] < gap) return false;
      this.last[name] = now;
      return true;
    }

    tone({ type = 'sine', f0, f1 = f0, dur = 0.15, vol = 0.3, at = 0, attack = 0.005, curve = 'exp' }) {
      const c = this.ctx, t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) {
        if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        else o.frequency.linearRampToValueAtTime(f1, t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    }

    hiss({ dur = 0.2, vol = 0.2, at = 0, type = 'bandpass', f = 1200, q = 1, f1 }) {
      const c = this.ctx, t = c.currentTime + at;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      const fl = c.createBiquadFilter();
      fl.type = type;
      fl.frequency.setValueAtTime(f, t);
      if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      fl.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl).connect(g).connect(this.master);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.05);
    }

    putt(power) {
      if (!this.ok('putt', 0.1)) return;
      const v = 0.18 + power * 0.3;
      this.tone({ type: 'sine', f0: 1100, f1: 260, dur: 0.07, vol: v });
      this.tone({ type: 'triangle', f0: 180, f1: 90, dur: 0.12, vol: v * 0.6 });
      this.hiss({ dur: 0.05, vol: v * 0.5, type: 'highpass', f: 3000 });
    }

    bounce(strength, kind) {
      if (!this.ok('bounce', 0.05)) return;
      const v = Math.min(0.3, 0.05 + strength / 2600);
      if (kind === 'post') {
        this.tone({ type: 'triangle', f0: 300, f1: 150, dur: 0.1, vol: v * 1.2 });
      } else if (kind === 'spinner' || kind === 'slider') {
        this.tone({ type: 'square', f0: 200, f1: 120, dur: 0.09, vol: v * 0.5 });
        this.hiss({ dur: 0.06, vol: v * 0.6, f: 900, q: 3 });
      } else {
        this.tone({ type: 'triangle', f0: 620 + Math.random() * 80, f1: 300, dur: 0.07, vol: v });
      }
    }

    bumper() {
      if (!this.ok('bumper', 0.06)) return;
      const o = this.tone({ type: 'sine', f0: 260, f1: 980, dur: 0.22, vol: 0.32, curve: 'lin' });
      if (o) {
        const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
        lfo.frequency.value = 28;
        lg.gain.value = 60;
        lfo.connect(lg).connect(o.frequency);
        lfo.start();
        lfo.stop(this.ctx.currentTime + 0.3);
      }
      this.tone({ type: 'square', f0: 1400, f1: 1800, dur: 0.05, vol: 0.06 });
    }

    lip() {
      if (!this.ok('lip', 0.2)) return;
      this.tone({ type: 'sine', f0: 1500, dur: 0.06, vol: 0.14 });
      this.tone({ type: 'sine', f0: 1150, dur: 0.08, vol: 0.12, at: 0.07 });
    }

    cup() {
      if (!this.ok('cup', 0.3)) return;
      this.tone({ type: 'sine', f0: 700, f1: 140, dur: 0.22, vol: 0.4 });
      this.hiss({ dur: 0.12, vol: 0.18, type: 'lowpass', f: 900 });
      for (let i = 0; i < 3; i++) this.tone({ type: 'triangle', f0: 900 - i * 120, dur: 0.04, vol: 0.12 / (i + 1), at: 0.18 + i * 0.07 });
    }

    cheer(tier) {
      if (!this.ok('cheer', 0.5)) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
      if (tier <= 0) {
        this.tone({ type: 'triangle', f0: 523.25, dur: 0.16, vol: 0.18, at: 0.25 });
        this.tone({ type: 'triangle', f0: 392, dur: 0.24, vol: 0.18, at: 0.42 });
        return;
      }
      const n = tier === 1 ? 3 : tier === 2 ? 4 : 6;
      for (let i = 0; i < n; i++) {
        this.tone({ type: 'triangle', f0: notes[i], dur: 0.3, vol: 0.2, at: 0.2 + i * 0.09 });
        this.tone({ type: 'sine', f0: notes[i] * 2, dur: 0.2, vol: 0.05, at: 0.2 + i * 0.09 });
      }
      if (tier >= 2) {
        const end = 0.2 + n * 0.09;
        for (const f of [523.25, 659.25, 783.99]) this.tone({ type: 'sawtooth', f0: f, dur: 0.7, vol: 0.05, at: end, attack: 0.03 });
        this.hiss({ dur: 1.2, vol: 0.08 + tier * 0.02, at: 0.25, f: 1800, q: 0.6 }); // crowd "yay"
      }
      if (tier >= 3) {
        for (let i = 0; i < 5; i++) {
          this.hiss({ dur: 0.25, vol: 0.12, at: 0.8 + i * 0.22, type: 'lowpass', f: 2500, f1: 300 });
          this.tone({ type: 'sine', f0: 1800 + i * 200, f1: 600, dur: 0.3, vol: 0.05, at: 0.65 + i * 0.22 });
        }
      }
    }

    fall(cause) {
      if (!this.ok('fall', 0.4)) return;
      if (cause === 'lava') {
        this.hiss({ dur: 0.7, vol: 0.22, type: 'highpass', f: 2500 });
        this.tone({ type: 'sine', f0: 300, f1: 90, dur: 0.4, vol: 0.15 });
      } else if (cause === 'blackhole') {
        this.tone({ type: 'sawtooth', f0: 400, f1: 40, dur: 0.9, vol: 0.12 });
        this.hiss({ dur: 0.9, vol: 0.12, type: 'lowpass', f: 1500, f1: 100 });
      } else {
        this.tone({ type: 'sine', f0: 1400, f1: 180, dur: 0.9, vol: 0.2 });
      }
    }

    respawn() {
      if (!this.ok('respawn', 0.2)) return;
      this.tone({ type: 'sine', f0: 400, f1: 900, dur: 0.18, vol: 0.14 });
    }

    portal() {
      if (!this.ok('portal', 0.15)) return;
      this.tone({ type: 'sine', f0: 300, f1: 1400, dur: 0.3, vol: 0.18 });
      this.tone({ type: 'sine', f0: 310, f1: 1450, dur: 0.3, vol: 0.12 });
    }

    boost() {
      if (!this.ok('boost', 0.15)) return;
      this.tone({ type: 'sawtooth', f0: 160, f1: 900, dur: 0.2, vol: 0.1 });
      this.hiss({ dur: 0.25, vol: 0.12, f: 800, f1: 3000 });
    }

    star(i) {
      if (!this.ok(`star${i}`, 0.05)) return;
      this.tone({ type: 'sine', f0: 880 * Math.pow(1.26, i), dur: 0.35, vol: 0.16 });
      this.tone({ type: 'triangle', f0: 1760 * Math.pow(1.26, i), dur: 0.2, vol: 0.05 });
    }

    click() {
      if (!this.ok('click', 0.05)) return;
      this.tone({ type: 'sine', f0: 660, f1: 880, dur: 0.06, vol: 0.12 });
    }

    handle(events) {
      for (const e of events) {
        if (e.type === 'putt') this.putt(e.power);
        else if (e.type === 'wall' || e.type === 'post' || e.type === 'spinner' || e.type === 'slider') this.bounce(e.strength, e.type);
        else if (e.type === 'bumper') this.bumper();
        else if (e.type === 'lip') this.lip();
        else if (e.type === 'sunk') this.cup();
        else if (e.type === 'fall') this.fall(e.cause);
        else if (e.type === 'respawn') this.respawn();
        else if (e.type === 'portal') this.portal();
        else if (e.type === 'boost') this.boost();
      }
    }
  }

  root.MoonshotAudio = GolfAudio;
})(typeof self !== 'undefined' ? self : this);
