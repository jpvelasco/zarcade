// Exhaustive mate solver for the Puzzle Trail. DOM-free; the tests use it
// to prove that every mate puzzle works and has exactly one key move.

// Can the side to move force checkmate within `n` of its own moves?
export function mateIn(pos, n) {
  const moves = orderChecksFirst(pos, pos.legalMoves());
  for (const m of moves) {
    pos.make(m);
    const ok = defenderLoses(pos, n);
    pos.unmake();
    if (ok) return true;
  }
  return false;
}

// Defender to move: true if every reply still loses within n - 1 attacker moves.
function defenderLoses(pos, n) {
  const replies = pos.legalMoves();
  if (!replies.length) return pos.inCheck();
  if (n <= 1) return false;
  for (const r of replies) {
    pos.make(r);
    const ok = mateIn(pos, n - 1);
    pos.unmake();
    if (!ok) return false;
  }
  return true;
}

function orderChecksFirst(pos, moves) {
  const checks = [], rest = [];
  for (const m of moves) {
    pos.make(m);
    (pos.inCheck() ? checks : rest).push(m);
    pos.unmake();
  }
  return checks.concat(rest);
}

// Every move that forces mate within n moves.
export function mateKeys(pos, n) {
  const keys = [];
  for (const m of pos.legalMoves()) {
    pos.make(m);
    if (defenderLoses(pos, n)) keys.push(m);
    pos.unmake();
  }
  return keys;
}

// Does this move force mate within n moves (n = 1: is it checkmate)?
export function moveMatesIn(pos, m, n) {
  pos.make(m);
  const ok = defenderLoses(pos, n);
  pos.unmake();
  return ok;
}
