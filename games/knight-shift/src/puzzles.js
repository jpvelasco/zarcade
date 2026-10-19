// The Puzzle Trail: hand-picked checkmates and tactics, easiest first.
//   goal 'mate': deliver checkmate in `n` moves. `line` is the main line in
//                SAN, alternating your move and the reply. Your moves before
//                the last must match (tests prove each is the only one that
//                works); the last move can be any checkmate.
//   goal 'win':  a tactic that wins material. Your moves must match `line`.
// The tests replay every line and check each mate with the solver, and each
// tactic's first move with the engine.

export const CHAPTERS = [
  { id: 'meadow', name: 'Checkmate Meadow', blurb: 'Mate in one move', color: '#7bd36a' },
  { id: 'town', name: 'Tactic Town', blurb: 'Forks, pins and skewers', color: '#ffb84a' },
  { id: 'woods', name: 'Two-Step Woods', blurb: 'Mate in two moves', color: '#5ec8ff' },
  { id: 'summit', name: "Owl's Summit", blurb: 'Mate in three moves', color: '#c78bff' },
];

export const PUZZLES = [
  // ---------------------------------------------------------- mate in 1
  { id: 'back-rank', chapter: 'meadow', title: 'Back Rank', goal: 'mate', n: 1, fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', line: ['Rd8#'], tip: 'The king is stuck behind his own pawns.' },
  { id: 'scholars', chapter: 'meadow', title: "Scholar's Mate", goal: 'mate', n: 1, fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', line: ['Qxf7#'], tip: 'The f7 pawn is only guarded by the king.' },
  { id: 'queen-kiss', chapter: 'meadow', title: 'Queen Kiss', goal: 'mate', n: 1, fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', line: ['Qg7#'], tip: 'Your king can guard the queen right next to theirs.' },
  { id: 'smothered', chapter: 'meadow', title: 'Smothered!', goal: 'mate', n: 1, fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', line: ['Nf7#'], tip: 'The king is boxed in by his own pieces. Who can jump in?' },
  { id: 'arabian', chapter: 'meadow', title: 'Arabian Mate', goal: 'mate', n: 1, fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', line: ['Rh7#'], tip: 'The knight can protect the rook.' },
  { id: 'anastasia', chapter: 'meadow', title: "Anastasia's Mate", goal: 'mate', n: 1, fen: '5r2/4Nppk/8/8/8/8/8/K1R5 w - - 0 1', line: ['Rh1#'], tip: 'Your knight already covers the escape squares.' },
  { id: 'fools', chapter: 'meadow', title: "Fool's Mate", goal: 'mate', n: 1, fen: 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', line: ['Qh5#'], tip: 'One diagonal to the king is wide open.' },
  { id: 'fools-black', chapter: 'meadow', title: 'Black Bites Back', goal: 'mate', n: 1, fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', line: ['Qh4#'], tip: 'You play Black! White opened the door to his king.' },
  { id: 'ladder', chapter: 'meadow', title: 'Rook Ladder', goal: 'mate', n: 1, fen: 'k7/7R/8/8/8/8/8/6RK w - - 0 1', line: ['Rg8#'], tip: 'One rook guards a row. The other one attacks.' },
  { id: 'grab-mate', chapter: 'meadow', title: 'Grab and Mate', goal: 'mate', n: 1, fen: '3r2k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1', line: ['Qxd8#'], tip: 'A capture can be checkmate too.' },
  { id: 'promotion', chapter: 'meadow', title: 'Promotion Party', goal: 'mate', n: 1, fen: 'k7/2P5/1K6/8/8/8/8/8 w - - 0 1', line: ['c8=Q#'], tip: 'A pawn that reaches the far side becomes a new piece.' },
  { id: 'back-rank-black', chapter: 'meadow', title: 'Escape Hatch', goal: 'mate', n: 1, fen: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', line: ['Rd1#'], tip: 'You play Black. White forgot to give his king an escape square.' },
  { id: 'knight-helper', chapter: 'meadow', title: 'Knight Helper', goal: 'mate', n: 1, fen: 'r1bq1rk1/pppp1ppp/2n5/2b1p1NQ/2B1P3/8/PPPP1PPP/RNB1K2R w KQ - 0 6', line: ['Qxh7#'], tip: 'Your knight guards a square next to the king.' },
  { id: 'epaulette', chapter: 'meadow', title: 'Shoulder Pads', goal: 'mate', n: 1, fen: '3rkr2/8/8/8/8/1Q6/8/4K3 w - - 0 1', line: ['Qe6#'], tip: "The rooks block the king's sideways steps." },

  // ---------------------------------------------------------- tactics
  { id: 'royal-fork', chapter: 'town', title: 'Royal Fork', goal: 'win', fen: '4k3/8/8/3q4/4N3/8/8/4K3 w - - 0 1', line: ['Nf6+', 'Ke7', 'Nxd5+'], tip: 'Find a knight jump that attacks the king and the queen.' },
  { id: 'queen-fork', chapter: 'town', title: 'Queen Fork', goal: 'win', fen: 'r5k1/6pp/8/8/8/8/6PP/3Q2K1 w - - 0 1', line: ['Qd5+', 'Kf8', 'Qxa8+'], tip: 'Check the king and hit the rook at the same time.' },
  { id: 'pawn-fork', chapter: 'town', title: 'Pawn Fork', goal: 'win', fen: '6k1/6pp/2n1r3/8/3P4/2P5/6PP/5RK1 w - - 0 1', line: ['d5', 'Re3', 'dxc6'], tip: 'Even a little pawn can attack two pieces.' },
  { id: 'skewer', chapter: 'town', title: 'Skewer', goal: 'win', fen: '4q3/8/8/8/4k3/8/8/R5K1 w - - 0 1', line: ['Re1+', 'Kd4', 'Rxe8'], tip: "Check the king. What's hiding behind him?" },
  { id: 'discovered', chapter: 'town', title: 'Surprise Check', goal: 'win', fen: '4k3/8/1q6/8/2P5/4N3/8/4R2K w - - 0 1', line: ['Nd5+', 'Kd7', 'Nxb6+'], tip: "Move the knight out of the rook's way, with a threat." },
  { id: 'pinned', chapter: 'town', title: 'Pinned Down', goal: 'win', fen: '4k3/5p2/4n3/8/3P4/8/8/4R1K1 w - - 0 1', line: ['d5', 'Ke7', 'dxe6'], tip: "The knight can't move away. Attack it!" },
  { id: 'free-lunch', chapter: 'town', title: 'Free Lunch', goal: 'win', fen: '6k1/5pp1/7p/3n4/8/8/5PPP/3R2K1 w - - 0 1', line: ['Rxd5'], tip: 'Is anything left unguarded?' },
  { id: 'queen-snack', chapter: 'town', title: 'Queen Snack', goal: 'win', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', line: ['Nxh5'], tip: "You play Black. White's queen came out too early." },

  // ---------------------------------------------------------- mate in 2
  { id: 'philidor', chapter: 'woods', title: "Philidor's Gift", goal: 'mate', n: 2, fen: '5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1', line: ['Qg8+', 'Rxg8', 'Nf7#'], tip: 'Give away your queen. Then the knight finishes.' },
  { id: 'deflection', chapter: 'woods', title: 'Deflection', goal: 'mate', n: 2, fen: 'r5k1/5ppp/8/8/8/8/4RPPP/4Q1K1 w - - 0 1', line: ['Re8+', 'Rxe8', 'Qxe8#'], tip: 'Lure their rook to the wrong square.' },
  { id: 'anastasia-2', chapter: 'woods', title: 'Open the Door', goal: 'mate', n: 2, fen: '5r1k/4Nppp/8/7Q/8/3R4/6PP/6K1 w - - 0 1', line: ['Qxh7+', 'Kxh7', 'Rh3#'], tip: 'Open the h-file with a bang.' },
  { id: 'opera', chapter: 'woods', title: "Morphy's Opera", goal: 'mate', n: 2, fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16', line: ['Qb8+', 'Nxb8', 'Rd8#'], tip: 'A famous game from 1858. A queen sacrifice opens the d-file.' },
  { id: 'legal', chapter: 'woods', title: "Légal's Trap", goal: 'mate', n: 2, fen: 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6', line: ['Bxf7+', 'Ke7', 'Nd5#'], tip: 'Forget about your queen. Chase the king!' },
  { id: 'smother-black', chapter: 'woods', title: 'Black Smother', goal: 'mate', n: 2, fen: '6k1/8/8/2q5/8/7n/6PP/5R1K b - - 0 1', line: ['Qg1+', 'Rxg1', 'Nf2#'], tip: "You play Black. It's Philidor's trick in a mirror." },
  { id: 'rook-sneak', chapter: 'woods', title: 'Rook Sneak', goal: 'mate', n: 2, fen: 'r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 0 1', line: ['Qd8+', 'Bxd8', 'Re8#'], tip: 'Give up the queen to clear the way for a rook.' },
  { id: 'bishop-finish', chapter: 'woods', title: 'Bishop Finish', goal: 'mate', n: 2, fen: 'r2qk2r/pb4pp/1n2Pb2/2B2Q2/p1p5/2P5/2B2PPP/RN2R1K1 w - - 1 1', line: ['Qg6+', 'hxg6', 'Bxg6#'], tip: 'Check first. A bishop lands the final blow.' },
  { id: 'rooks-roar', chapter: 'woods', title: 'Rooks Roar', goal: 'mate', n: 2, fen: '6k1/pp4p1/2p5/2bp4/8/P5Pb/1P3rrP/2BRRN1K b - - 0 1', line: ['Rg1+', 'Kxg1', 'Rxf1#'], tip: 'You play Black. Two rooks and a bishop against a cornered king.' },
  { id: 'corner-trap', chapter: 'woods', title: 'Corner Trap', goal: 'mate', n: 2, fen: '7k/1p4p1/p4b1p/3N3P/2p5/2rb4/PP2r3/K2R2R1 b - - 0 1', line: ['Rc1+', 'Rxc1', 'Bxb2#'], tip: "You play Black. A rook check drags away the king's guard." },

  // ---------------------------------------------------------- mate in 3
  { id: 'smothered-classic', chapter: 'summit', title: 'Smothered Classic', goal: 'mate', n: 3, fen: '5rk1/5Npp/8/8/2Q5/8/8/6K1 w - - 0 1', line: ['Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#'], tip: 'Double check, a queen sacrifice, then a smothered mate.' },
  { id: 'king-hunt', chapter: 'summit', title: 'King Hunt', goal: 'mate', n: 3, fen: 'r1b1kb1r/pppp1ppp/5q2/4n3/3KP3/2N3PN/PPP4P/R1BQ1B1R b kq - 0 1', line: ['Bc5+', 'Kxc5', 'Qb6+', 'Kd5', 'Qd6#'], tip: 'You play Black. The white king is out in the open!' },
  { id: 'hidden-bishop', chapter: 'summit', title: 'Hidden Bishop', goal: 'mate', n: 3, fen: 'r5rk/5p1p/5R2/4B3/8/8/7P/7K w - - 0 1', line: ['Ra6+', 'f6', 'Bxf6+', 'Rg7', 'Rxa8#'], tip: 'Move the rook to uncover the bishop, and grab something too.' },
];

export const puzzleIndex = (id) => PUZZLES.findIndex((p) => p.id === id);

export function goalText(p, color) {
  const side = color === 0 ? 'White' : 'Black';
  if (p.goal === 'win') return `${side} to play and win material`;
  return `${side} to checkmate in ${p.n}`;
}

// Stars for a solved puzzle: three for a clean solve, two after one slip or
// hint, one otherwise.
export function puzzleStars(mistakes, hints) {
  const slips = mistakes + hints;
  return slips === 0 ? 3 : slips === 1 ? 2 : 1;
}
