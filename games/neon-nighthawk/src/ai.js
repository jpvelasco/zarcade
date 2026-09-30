import { clamp, wrapAngle } from './math.js';

// A cautious courier used by the browser autopilot mode and headless tests.
// It follows the generated road route, brakes through sharp corners, and
// treats dashes as a recovery tool rather than a requirement.
export function aiInput(world) {
  const player = world.player;
  const endpoint = world.routeTarget || world.target;
  if (!endpoint) return {};
  const segmentStart = world.routeIndex > 0
    ? world.route[world.routeIndex - 1]
    : world.contractStart;
  // Follow a point ahead on the street centreline rather than aiming directly
  // at a distant endpoint. That produces a stable line down long blocks and
  // leaves enough steering authority for the next intersection.
  const lookAhead = 155;
  let target = endpoint;
  let laneError = 0;
  if (segmentStart.y === endpoint.y) {
    const direction = Math.sign(endpoint.x - segmentStart.x) || 1;
    const remaining = (endpoint.x - player.x) * direction;
    target = {
      x: remaining > 0 ? player.x + direction * Math.min(lookAhead, remaining) : endpoint.x,
      y: endpoint.y,
    };
    laneError = player.y - endpoint.y;
  } else if (segmentStart.x === endpoint.x) {
    const direction = Math.sign(endpoint.y - segmentStart.y) || 1;
    const remaining = (endpoint.y - player.y) * direction;
    target = {
      x: endpoint.x,
      y: remaining > 0 ? player.y + direction * Math.min(lookAhead, remaining) : endpoint.y,
    };
    laneError = player.x - endpoint.x;
  }

  const desired = Math.atan2(target.y - player.y, target.x - player.x);
  const difference = wrapAngle(desired - player.angle);
  const distance = Math.hypot(target.x - player.x, target.y - player.y);
  const sharpTurn = Math.abs(difference) > 0.42;
  const trafficClose = world.traffic.some((vehicle) => {
    const x = vehicle.axis === 'x' ? vehicle.pos : vehicle.road + vehicle.lane;
    const y = vehicle.axis === 'x' ? vehicle.road + vehicle.lane : vehicle.pos;
    return Math.hypot(player.x - x, player.y - y) < 52;
  });
  const patrolClose = world.patrols.some((patrol) =>
    !patrol.jammed && Math.hypot(player.x - patrol.x, player.y - patrol.y) < 250);
  const wantsEcho = patrolClose && player.heat > 38 && player.charge > 58 && player.trail.length > 12 &&
    player.echoCooldown <= 0 && !player.echoHeld;
  const wantsPulse = !wantsEcho && patrolClose && player.charge > 35 && player.pulse <= 0 && !player.pulseHeld;

  return {
    turn: clamp(difference * 2.05, -1, 1),
    brake: (sharpTurn && player.speed > 172) ||
      (Math.abs(laneError) > 15 && player.speed > 160) ||
      (distance < 78 && Math.abs(difference) > 0.28),
    // Ability actions are edge-triggered in World. Release each control after
    // a tap so the next safe opportunity can trigger it again.
    dash: player.charge > player.maxCharge * 0.74 && !sharpTurn && distance > 210 && !trafficClose &&
      player.dash <= 0 && !player.dashHeld,
    pulse: wantsPulse,
    echo: wantsEcho,
  };
}
