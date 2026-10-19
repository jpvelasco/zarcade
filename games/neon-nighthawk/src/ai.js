import { trafficPosition } from './city.js';

// A cautious courier used by the browser autopilot mode and headless tests.
// It holds the direction of the next corner on the guide route, the same way
// a player would hold an arrow key, and uses abilities when drones close in.
export function aiInput(world) {
  const player = world.player;
  const target = world.target;
  const corner = world.routeTarget || target;
  if (!corner) return {};

  // Once on the final stretch, aim straight at a moving target.
  const aim = target && target.kind === 'runner' && Math.hypot(target.x - player.x, target.y - player.y) < 200
    ? target
    : corner;
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const span = Math.hypot(dx, dy) || 1;
  const moveX = dx / span;
  const moveY = dy / span;

  const trafficClose = world.traffic.some((vehicle) => {
    const point = trafficPosition(vehicle);
    return Math.hypot(player.x - point.x, player.y - point.y) < 60;
  });
  const patrolClose = world.patrols.some((patrol) =>
    !patrol.jammed && Math.hypot(player.x - patrol.x, player.y - patrol.y) < 250);
  const wantsEcho = patrolClose && player.heat > 38 && player.charge > 58 && player.trail.length > 12 &&
    player.echoCooldown <= 0 && !player.echoHeld;
  const wantsPulse = !wantsEcho && patrolClose && player.scan > 0.35 && player.charge > 35 &&
    player.pulse <= 0 && !player.pulseHeld;
  const chasing = target && target.kind === 'runner';
  const straight = Math.abs(Math.atan2(moveY, moveX) - Math.atan2(player.vy, player.vx)) < 0.2;

  return {
    moveX,
    moveY,
    // Ability actions are edge-triggered in World. Release each control after
    // a tap so the next safe opportunity can trigger it again.
    dash: !player.dashHeld && player.dash <= 0 && straight && !trafficClose && (
      (chasing && span < 260 && player.charge > 30) ||
      (player.charge > player.maxCharge * 0.8 && span > 240)
    ),
    pulse: wantsPulse,
    echo: wantsEcho,
  };
}
