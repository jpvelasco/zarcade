// What the AI worker does for each request, as a plain function so Node
// tests can call it without a Worker. DOM-free.
//   move:  a bot's move at `level` (optionally with a coach analysis of the
//          player's last move first)
//   hint:  the strongest move found within `timeMs`
import { Searcher, chooseMove } from './ai.js';
import { buildPosition } from './game.js';

const COACH_MS = 300;

export function createThinker() {
  const searcher = new Searcher();
  return function think(req) {
    const t0 = Date.now();
    const pos = buildPosition(req.setup, req.moves || []);
    if (req.type === 'hint') {
      const r = searcher.search(pos, { maxDepth: req.maxDepth || 24, timeMs: req.timeMs || 800 });
      return { id: req.id, type: 'hint', move: r.move ? pos.uci(r.move) : null, score: r.score, depth: r.depth, nodes: r.nodes, ms: Date.now() - t0 };
    }
    let coach = null;
    if (req.coach && req.moves && req.moves.length) {
      // Analyse the player's last move: best move before it, and the best reply after it.
      const before = buildPosition(req.setup, req.moves.slice(0, -1));
      const played = before.moveFromUci(req.moves[req.moves.length - 1]);
      const b = searcher.search(before, { maxDepth: 8, timeMs: COACH_MS });
      const a = searcher.search(pos, { maxDepth: 8, timeMs: COACH_MS });
      coach = { best: b.move ? before.uci(b.move) : null, bestScore: b.score, playedScore: -a.score, reply: a.move ? pos.uci(a.move) : null, played: played ? before.uci(played) : null };
    }
    const r = chooseMove(searcher, pos, req.level ?? 0, req.seed ?? 1);
    return { id: req.id, type: 'move', move: r.move ? pos.uci(r.move) : null, score: r.score, depth: r.depth, nodes: r.nodes, ms: Date.now() - t0, coach };
  };
}
