// Track pieces and how a train is routed through them. DOM-free.
//
// Edges: 0 = north, 1 = east, 2 = south, 3 = west. A train "enters from"
// the edge it crosses into the cell and leaves through its exit edge.

export const N = 0, E = 1, S = 2, W = 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIR_NAMES = ['N', 'E', 'S', 'W'];
export const opposite = (e) => (e + 2) & 3;

// Piece types the player can place.
//   S straight  v0 N–S, v1 E–W
//   C curve     v connects edge v and edge v+1 (v0 N–E, v1 E–S, v2 S–W, v3 W–N)
//   X crossing  one variant, straight through from any side
//   W switch    v0..3 stem on edge v with the curve branch clockwise (+1),
//               v4..7 stem on edge v-4 with the curve branch anticlockwise (+3)
export const VARIANTS = { S: 2, C: 4, X: 1, W: 8 };
export const PIECE_TYPES = ['S', 'C', 'X', 'W'];

export function switchParts(v) {
  const stem = v & 3;
  const hand = v < 4 ? 1 : 3;
  return { stem, straight: (stem + 2) & 3, curve: (stem + hand) & 3 };
}

// Route a train entering piece (t, v) from edge e with switch state s
// (0 = points set straight, 1 = set to the curve). Returns the exit edge
// and the new switch state, or null when the piece has no track on that edge.
export function route(t, v, s, e) {
  switch (t) {
    case 'S': {
      const a = v === 0 ? N : E;
      if (e === a) return { exit: opposite(a), s };
      if (e === opposite(a)) return { exit: a, s };
      return null;
    }
    case 'C': {
      const a = v, b = (v + 1) & 3;
      if (e === a) return { exit: b, s };
      if (e === b) return { exit: a, s };
      return null;
    }
    case 'X':
      return { exit: opposite(e), s };
    case 'W': {
      const p = switchParts(v);
      if (e === p.stem) return { exit: s ? p.curve : p.straight, s: s ? 0 : 1 };
      if (e === p.straight || e === p.curve) return { exit: p.stem, s };
      return null;
    }
    default:
      return null;
  }
}

// Edges that have track on them (for drawing, auto-orienting and drag-to-draw).
export function openEdges(t, v) {
  switch (t) {
    case 'S': return v === 0 ? [N, S] : [E, W];
    case 'C': return [v, (v + 1) & 3];
    case 'X': return [N, E, S, W];
    case 'W': { const p = switchParts(v); return [p.stem, p.straight, p.curve]; }
    default: return [];
  }
}

// The piece that joins edge a to edge b (a !== b): a straight or a curve.
export function pieceJoining(a, b) {
  if (a === opposite(b)) return { t: 'S', v: a === N || a === S ? 0 : 1 };
  for (let v = 0; v < 4; v++) {
    if ((a === v && b === ((v + 1) & 3)) || (b === v && a === ((v + 1) & 3))) return { t: 'C', v };
  }
  return null;
}

// Next variant when the player turns a piece (dir +1 clockwise, -1 back).
// Switches turn through their four stems, then flip hand.
export function turn(t, v, dir = 1) {
  const n = VARIANTS[t] || 1;
  return (v + dir + n) % n;
}

export const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];
export const COLOR_HEX = {
  red: '#e8504a', blue: '#3f86e0', yellow: '#f5c22b', green: '#3dae5c', purple: '#9a5fd0', orange: '#f08a2c',
};
export const COLOR_DARK = {
  red: '#a8302c', blue: '#24579e', yellow: '#b98a10', green: '#257a3c', purple: '#663a96', orange: '#b25e14',
};
// A shape per colour so colour is never the only cue.
export const COLOR_SYMBOL = { red: 'heart', blue: 'drop', yellow: 'star', green: 'leaf', purple: 'moon', orange: 'sun' };
export const COLOR_LABEL = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', purple: 'purple', orange: 'orange' };
