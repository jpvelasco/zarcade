// Shared by the solver tests: the autoplayer plays a level to the end.
import { Game, STEP } from '../src/game.js';
import { Autopilot } from '../src/ai.js';

export function autoplay(level, mode = 'climb') {
  const g = new Game({ mode, level });
  const ap = new Autopilot({ budget: 1000, pause: 0, instant: true });
  for (let i = 0; i < 60 * 120 && g.phase !== 'won' && g.phase !== 'lost'; i++) {
    g.step(STEP, ap.controls(g, STEP));
    g.events.length = 0;
  }
  return g;
}
