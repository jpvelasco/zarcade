// Scoring, accuracy and grades. DOM-free.

export const WEIGHT = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
export const POINTS = { perfect: 1000, great: 700, good: 400, miss: 0 };
export const GRADES = [
  { grade: 'S', min: 0.95 },
  { grade: 'A', min: 0.85 },
  { grade: 'B', min: 0.7 },
  { grade: 'C', min: 0 },
];
export const MAX_SCORE = 1000000;

export function emptyCounts() {
  return { perfect: 0, great: 0, good: 0, miss: 0 };
}

/** Accuracy 0..1 over the judgements made so far. */
export function accuracy(counts) {
  const n = counts.perfect + counts.great + counts.good + counts.miss;
  if (!n) return 1;
  return (counts.perfect * WEIGHT.perfect + counts.great * WEIGHT.great + counts.good * WEIGHT.good) / n;
}

export function gradeFor(acc) {
  return GRADES.find((g) => acc >= g.min - 1e-9).grade;
}

/** 90% of the score from accuracy over the whole chart, 10% from the longest combo. */
export function finalScore(counts, maxCombo, total) {
  if (!total) return 0;
  const weighted = counts.perfect * WEIGHT.perfect + counts.great * WEIGHT.great + counts.good * WEIGHT.good;
  return Math.round(MAX_SCORE * (0.9 * (weighted / total) + 0.1 * (maxCombo / total)));
}

export const GRADE_RANK = { S: 4, A: 3, B: 2, C: 1 };

export function betterGrade(a, b) {
  return (GRADE_RANK[a] || 0) >= (GRADE_RANK[b] || 0) ? a : b;
}
