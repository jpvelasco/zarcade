// Chess960 (Fischer random) start positions by Scharnagl number, 0..959.
// Number 518 is the normal chess setup.
const KNIGHT_TABLE = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];

export function backRank(n) {
  if (!Number.isInteger(n) || n < 0 || n > 959) throw new Error(`Chess960 number out of range: ${n}`);
  const rank = Array(8).fill(null);
  rank[(n % 4) * 2 + 1] = 'b'; // light-squared bishop on b, d, f or h
  n = Math.floor(n / 4);
  rank[(n % 4) * 2] = 'b'; // dark-squared bishop on a, c, e or g
  n = Math.floor(n / 4);
  const empty = () => rank.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  rank[empty()[n % 6]] = 'q';
  n = Math.floor(n / 6);
  const [a, b] = KNIGHT_TABLE[n];
  const free = empty();
  rank[free[a]] = 'n';
  rank[free[b]] = 'n';
  const rest = empty(); // rook, king, rook from left to right
  rank[rest[0]] = 'r';
  rank[rest[1]] = 'k';
  rank[rest[2]] = 'r';
  return rank.join('');
}

export function chess960Fen(n) {
  const r = backRank(n);
  return `${r}/pppppppp/8/8/8/8/PPPPPPPP/${r.toUpperCase()} w KQkq - 0 1`;
}
