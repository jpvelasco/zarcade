// A simple autoplayer. It keeps the level balance honest in tests and drives
// the attract-mode board behind the title screen.
import { findMoves, isJelly, RAINBOW, BOMB } from './board.js';

export function resolveAll(game, limit = 600) {
  for (let n = 0; n < limit; n++) if (!game.step()) break;
}

function goalHave(game) {
  return game.goalStatus().map((g) => g.have / Math.max(1, g.need));
}

// How useful a move looks before trying it: goal tiles nearby, specials made.
function quickScore(game, move) {
  const board = game.board;
  const goals = game.level.goals;
  let s = move.size ?? 3;
  if (move.makes === RAINBOW) s += 14;
  else if (move.makes === BOMB) s += 9;
  else if (move.makes) s += 6;
  if (move.kind === 'special') s += 7;
  const touched = [move.a, move.b];
  for (const i of touched) {
    const c = board.col(i), r = board.row(i);
    for (const goal of goals) {
      if (goal.type === 'sand' && board.ground[i] > 0) s += 6;
      if (goal.type === 'collect') {
        const cell = board.at(i);
        if (isJelly(cell) && cell.color === goal.color) s += 4;
      }
      if (goal.type === 'coral' || goal.type === 'ice') {
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!board.inside(c + dc, r + dr)) continue;
          const cell = board.at(board.idx(c + dc, r + dr));
          if (!cell) continue;
          if (goal.type === 'coral' && cell.kind === 'coral') s += 8;
          if (goal.type === 'ice' && isJelly(cell) && cell.ice > 0) s += 8;
        }
      }
      if (goal.type === 'eggs') s += eggPull(board, c, r) + r * 2;
    }
  }
  return s;
}

// Eggs only count once they reach the floor, so reward digging underneath them.
function eggPull(board, c, r) {
  let s = 0;
  for (let rr = 0; rr < r; rr++) {
    const cell = board.at(board.idx(c, rr));
    if (cell && cell.kind === 'egg') s += 10;
  }
  return s;
}

// How far the eggs have travelled, counting a hatched egg as all the way down.
function eggProgress(game) {
  let total = game.counts.eggs * (game.board.h + 1);
  for (const i of game.board.playableIndices()) {
    const cell = game.board.at(i);
    if (cell && cell.kind === 'egg') total += game.board.row(i);
  }
  return total;
}

// Tries the shortlist for real on a copy and keeps whatever helps the goals.
function deepScore(game, move) {
  const eggLevel = game.level.goals.some((g) => g.type === 'eggs');
  const before = goalHave(game);
  const beforeScore = game.score;
  const copy = game.clone();
  if (!copy.swap(move.a, move.b).ok) return -Infinity;
  resolveAll(copy);
  const after = goalHave(copy);
  let value = (copy.score - beforeScore) * 0.03;
  after.forEach((v, k) => { value += (v - before[k]) * 900; });
  if (eggLevel) {
    value += (eggProgress(copy) - eggProgress(game)) * 60;
    // Playing low keeps the floor churning so the eggs keep sinking.
    value += (game.board.row(move.a) + game.board.row(move.b)) * 18;
  }
  for (const i of copy.board.playableIndices()) {
    const cell = copy.board.at(i);
    if (isJelly(cell) && cell.special) value += 12;
  }
  if (copy.phase === 'won' || copy.phase === 'finale') value += 4000;
  return value;
}

export function pickMove(game, { depth = 6 } = {}) {
  const moves = findMoves(game.board);
  if (!moves.length) return null;
  const shortlist = moves
    .map((m) => ({ m, q: quickScore(game, m) }))
    .sort((a, b) => b.q - a.q)
    .slice(0, depth);
  let best = shortlist[0].m;
  let bestValue = -Infinity;
  for (const { m } of shortlist) {
    const value = deepScore(game, m);
    if (value > bestValue) { bestValue = value; best = m; }
  }
  return best;
}

export function autoPlay(game, { maxTurns = 200, depth = 6, useContinue = false } = {}) {
  let turns = 0;
  while (turns++ < maxTurns) {
    if (game.phase === 'outOfMoves') {
      if (useContinue && game.useContinue()) continue;
      game.giveUp();
    }
    if (game.phase === 'won' || game.phase === 'lost') break;
    if (game.pendingShuffle) game.doShuffle();
    if (game.phase === 'finale') { resolveAll(game); continue; }
    if (game.phase !== 'input') { resolveAll(game); continue; }
    const move = pickMove(game, { depth });
    if (!move) { game.doShuffle(); continue; }
    if (!game.swap(move.a, move.b).ok) break;
    resolveAll(game);
  }
  return { won: game.phase === 'won', score: game.score, stars: game.stars(), turns, phase: game.phase };
}
