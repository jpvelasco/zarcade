// A small "keep walking right and jump when you have to" pilot.
//
// It is not clever enough for the whole mountain, but it is good enough to
// prove the meadow is walkable in a Node test and to run the title screen's
// attract mode without a player.

import { TILE } from './tiles.js';
import { isBlocking, isHazard, isPlatform } from './tiles.js';

const HOLD = 0.26;

export class Bot {
  constructor(world) {
    this.world = world;
    this.hold = 0;
    this.cooldown = 0;
    this.pressed = false;
  }

  solid(col, row) {
    const ch = this.world.tileAt(col, row);
    return isBlocking(ch) || isPlatform(ch);
  }

  danger(col, row) {
    return isHazard(this.world.tileAt(col, row));
  }

  /** Decide this frame's controls. */
  input(dt) {
    const p = this.world.player;
    const foot = Math.floor((p.y + p.h + 2) / TILE);
    const chest = Math.floor((p.y + p.h / 2) / TILE);
    const head = Math.floor((p.y + 2) / TILE);
    const col = Math.floor((p.x + p.w / 2) / TILE);

    let want = false;
    // A hole coming up: nothing to stand on for the next two tiles.
    if (!this.solid(col + 1, foot) && !this.solid(col + 2, foot)) want = true;
    // Something to climb.
    if (this.solid(col + 1, chest) || this.solid(col + 1, head)) want = true;
    // Thorns or water either side of us.
    if (this.danger(col + 1, chest) || this.danger(col + 1, foot) || this.danger(col + 2, foot)) want = true;

    this.cooldown = Math.max(0, this.cooldown - dt);
    let jumpPressed = false;
    if (want && this.hold <= 0 && this.cooldown <= 0 && (p.onGround || p.coyote > 0)) {
      this.hold = HOLD;
      this.cooldown = 0.18;
      jumpPressed = true;
    }
    this.hold = Math.max(0, this.hold - dt);
    // A second hop in midair whenever we are falling short of a ledge.
    if (!p.onGround && p.vy > 60 && p.airJumps > 0 && !this.solid(col + 1, foot + 1)) {
      jumpPressed = true;
      this.hold = HOLD * 0.6;
    }
    return { left: false, right: true, down: false, jump: this.hold > 0, jumpPressed };
  }
}

/** Run a world with the bot until it finishes or the clock runs out. */
export function botRun(world, { seconds = 90, dt = 1 / 60 } = {}) {
  const bot = new Bot(world);
  let elapsed = 0;
  while (elapsed < seconds && world.status === 'play') {
    world.step(dt, bot.input(dt));
    world.events.length = 0;
    elapsed += dt;
  }
  return { finished: world.status === 'complete', elapsed };
}
