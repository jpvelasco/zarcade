// Camera maths for any viewport, DOM-free. The view always fills the window;
// these numbers pick how much track you see and where your kart sits.

export const KART_LENGTH = 26;
const AHEAD = 340; // world units of road you want to see in front
const ACROSS = 300; // and across

// zoom: CSS pixels per world unit. anchorY: where the kart sits (fraction of
// the height from the top) when the camera turns with the kart.
export function viewFor(w, h) {
  w = Math.max(1, w);
  h = Math.max(1, h);
  const portrait = h > w * 1.1;
  const short = h < 520; // phones on their side
  // Portrait phones keep the kart above the thumbs (the bottom third is the
  // steering zone), which still leaves a long view ahead.
  const anchorY = portrait ? 0.6 : short ? 0.66 : 0.68;
  const fit = Math.min((anchorY * h) / AHEAD, w / ACROSS);
  const zoom = clamp(fit, short ? 0.9 : 1.05, 2.4);
  return { zoom, anchorY, portrait, short };
}

// Speed zooms out a touch so fast stretches show more road.
export function speedZoom(zoom, speedFrac, reduced = false) {
  const f = clamp(speedFrac, 0, 1.5);
  return zoom * (1 - (reduced ? 0.04 : 0.1) * f);
}

// World units visible ahead of the kart for a view.
export function aheadOf(view, h) {
  return (view.anchorY * h) / view.zoom;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
