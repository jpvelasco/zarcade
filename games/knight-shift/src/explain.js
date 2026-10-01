// "Why was that bad?": friendly coach notes for blunders at the easy levels.
// DOM-free. Input is the position before the player's move, the move, and
// the engine's analysis (scores in centipawns from the player's side):
//   { best, bestScore, playedScore, reply }
// where `reply` is the opponent's best answer to the played move.
import { PIECE_NAME, sqName, mTo, mFlag, EP, CASTLE_K, CASTLE_Q, SHIELD, SWAP } from './chess.js';
import { MATE_BOUND } from './ai.js';

export const BLUNDER_CP = 180;

function capturedBy(pos, m) {
  const f = mFlag(m);
  if (f === EP) return 1;
  if (f === CASTLE_K || f === CASTLE_Q || f === SHIELD || f === SWAP) return 0;
  return pos.board[mTo(m)] & 7;
}

function givesMate(pos, m) {
  pos.make(m);
  const mate = pos.inCheck() && pos.legalMoves().length === 0;
  pos.unmake();
  return mate;
}

const points = (n) => `${n} point${n === 1 ? '' : 's'}`;

// Returns null when the move was fine, or { text, better, severity }.
export function explainMove(pos, played, analysis, opponentName = 'They') {
  const { best, bestScore, playedScore, reply } = analysis;
  if (!best || best === played) return null;
  const loss = bestScore - playedScore;
  if (loss < BLUNDER_CP) return null;
  // Already completely winning or losing: don't nag.
  if (bestScore < -1500 || (playedScore > 900 && bestScore < MATE_BOUND)) return null;

  const betterSan = pos.san(best);
  const out = (text, severity = 'oops') => ({ text, better: best, betterSan, severity, loss });

  if (givesMate(pos, best)) return out(`You had checkmate! Try ${betterSan}.`, 'missed');

  pos.make(played);
  try {
    if (reply) {
      if (givesMate(pos, reply)) return out(`Uh-oh! That lets ${opponentName} checkmate you with ${pos.san(reply)}. Watch your king!`, 'danger');
      const lostType = capturedBy(pos, reply);
      if (lostType && lostType !== 1) {
        const sq = sqName(mTo(reply));
        const attacker = PIECE_NAME[pos.board[reply & 127] & 7];
        return out(`Careful! Now their ${attacker} can take your ${PIECE_NAME[lostType]} on ${sq}. ${betterSan} was safer.`);
      }
    }
  } finally {
    pos.unmake();
  }

  const won = capturedBy(pos, best);
  if (won && won !== 1 && capturedBy(pos, played) < won) {
    return out(`You could have captured their ${PIECE_NAME[won]} with ${betterSan}!`, 'missed');
  }
  if (playedScore <= -MATE_BOUND) return out(`That walks into a checkmate trap. ${betterSan} was better.`, 'danger');
  const lost = Math.max(1, Math.round(loss / 100));
  return out(`That gives away about ${points(lost)}. ${betterSan} was stronger.`);
}

