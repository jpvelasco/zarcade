// Perspective camera for the pseudo-3D view. Pure maths, no DOM, so the
// framing can be tested for phone and laptop shapes.
//
// The camera sits behind and above the dino (which is always at z = 0),
// pitched down. Portrait screens get a higher, steeper camera so all three
// lanes fit across a phone.
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const ROAD_HALF = 3.6; // metres from the middle lane to the road edge

export function makeCamera(w, h) {
  const aspect = w / h;
  const k = clamp((aspect - 0.5) / (1.5 - 0.5), 0, 1); // 0 = tall phone, 1 = wide laptop
  // A long, telephoto camera keeps far obstacles readable; its height sets
  // how much of the screen the path fills below the horizon.
  const H = lerp(7.6, 4.4, k);
  const D = 15;
  const pitch = 0.6 * Math.atan(H / D);
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  const f0 = D * cos + H * sin; // forward distance to the dino's feet
  const up0 = -H * cos + D * sin;
  // The three lanes fill a phone's width, about half a laptop's.
  const span = 3 * 2.2;
  let F = (lerp(1.04, 0.52, k) * w * f0) / span;
  // ...but keep the dino a friendly size on very wide or very short screens.
  F = Math.min(F, (0.22 * h * f0) / 1.4);
  const feetY = lerp(0.8, 0.84, k) * h;
  const cy = feetY + (up0 * F) / f0;
  const cam = { w, h, H, D, pitch, cos, sin, F, cx: w / 2, cy, feetY, horizon: cy - F * Math.tan(pitch), near: 0.8 };
  return cam;
}

// Project a track-space point (metres; z relative to the dino) into `out`:
// { x, y, s } where s is pixels per metre at that depth. Returns false when
// the point is behind the near plane.
export function project(cam, x, y, z, out) {
  const ry = y - cam.H;
  const rz = z + cam.D;
  const fwd = rz * cam.cos - ry * cam.sin;
  if (fwd < cam.near) return false;
  const up = ry * cam.cos + rz * cam.sin;
  const s = cam.F / fwd;
  out.x = cam.cx + x * s;
  out.y = cam.cy - up * s;
  out.s = s;
  return true;
}
