// Lap ghosts: position and heading sampled at a fixed rate from the start of
// a lap, packed as int16 triples in base64 so a dozen fit in a save easily.
import { TAU, lerp, wrapAngle } from './math.js';

export const GHOST_HZ = 20;
const POS = 4; // quarter-unit precision
const ANG = 32767 / Math.PI;
const MAX_SAMPLES = GHOST_HZ * 180; // three minutes is plenty for one lap

export class GhostRecorder {
  constructor() {
    this.samples = [];
    this.t = 0;
  }
  reset() {
    this.samples.length = 0;
    this.t = 0;
  }
  // Called every simulation step with the lap clock.
  record(lapTime, x, y, h) {
    while (this.t <= lapTime + 1e-9 && this.samples.length < MAX_SAMPLES * 3) {
      this.samples.push(x, y, h);
      this.t += 1 / GHOST_HZ;
    }
  }
}

export function encodeGhost(samples) {
  const n = Math.min(samples.length, MAX_SAMPLES * 3);
  const ints = new Int16Array(n);
  for (let i = 0; i < n; i += 3) {
    ints[i] = clampInt(Math.round(samples[i] * POS));
    ints[i + 1] = clampInt(Math.round(samples[i + 1] * POS));
    ints[i + 2] = clampInt(Math.round(wrapAngle(samples[i + 2]) * ANG));
  }
  const bytes = new Uint8Array(ints.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x4000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x4000));
  return btoa(bin);
}

// Returns a Float32Array of [x, y, h] triples, or null for anything that is
// not a valid ghost.
export function decodeGhost(str) {
  if (typeof str !== 'string' || str.length < 8 || str.length > 200000) return null;
  try {
    const bin = atob(str);
    if (bin.length % 6 !== 0) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ints = new Int16Array(bytes.buffer);
    const out = new Float32Array(ints.length);
    for (let i = 0; i < ints.length; i += 3) {
      out[i] = ints[i] / POS;
      out[i + 1] = ints[i + 1] / POS;
      out[i + 2] = ints[i + 2] / ANG;
    }
    return out.length >= 6 ? out : null;
  } catch {
    return null;
  }
}

// Interpolated ghost pose at lap time t (clamped to the recorded lap).
export function ghostAt(g, t, out = { x: 0, y: 0, h: 0 }) {
  const count = g.length / 3;
  const f = Math.max(0, Math.min(count - 1, t * GHOST_HZ));
  const i = Math.min(count - 2, Math.floor(f));
  const u = f - i;
  const a = i * 3, b = a + 3;
  out.x = lerp(g[a], g[b], u);
  out.y = lerp(g[a + 1], g[b + 1], u);
  let dh = g[b + 2] - g[a + 2];
  if (dh > Math.PI) dh -= TAU;
  if (dh < -Math.PI) dh += TAU;
  out.h = g[a + 2] + dh * u;
  return out;
}

function clampInt(v) {
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v;
}
