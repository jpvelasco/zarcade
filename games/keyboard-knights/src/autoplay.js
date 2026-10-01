// A bot typist: types at a set speed with occasional typos. Used by the tests
// as a balance check and by the title screen as an attract-mode demo.
import { mulberry32 } from './rng.js';

export class Autoplay {
  constructor({ wpm = 30, errorRate = 0.03, seed = 7, useSpecial = true } = {}) {
    this.interval = 60 / (wpm * 5);
    this.errorRate = errorRate;
    this.rng = mulberry32(seed);
    this.timer = 0.4;
    this.useSpecial = useSpecial;
  }

  // Advance the bot by dt seconds; returns the characters it typed.
  update(battle, dt) {
    const typed = [];
    if (battle.status !== 'play') return typed;
    this.timer -= dt;
    while (this.timer <= 0) {
      this.timer += this.interval * (0.7 + this.rng() * 0.6);
      if (this.useSpecial && battle.meter >= 10 && battle.monsters.filter((m) => m.x <= 100).length >= 3) {
        battle.special();
        continue;
      }
      const ch = this.choose(battle);
      if (ch == null) { this.timer = Math.max(this.timer, 0.15); break; }
      battle.type(ch);
      typed.push(ch);
    }
    return typed;
  }

  choose(battle) {
    let m = battle.target ? battle.monsters.find((x) => x.id === battle.target) : null;
    if (!m) {
      for (const x of battle.monsters) if (x.x <= 100 && x.typed === 0 && (!m || x.x < m.x)) m = x;
    }
    if (!m) return null;
    const want = m.word[m.typed];
    if (this.rng() < this.errorRate) return want === 'x' ? 'z' : 'x';
    return want;
  }
}
