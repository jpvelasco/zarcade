// The dictionary: target words with glosses, plus the bonus words. DOM-free.
import { GLOSS_TEXT } from './data/glosses.js';
import { BONUS_TEXT } from './data/bonus.js';

export const MIN_LEN = 3;
export const MAX_LEN = 7;

// Parses `word: gloss` lines. `word+:` adds the plain plural too.
export function parseGlosses(text) {
  const entries = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) throw new Error(`Bad gloss line: ${line}`);
    let word = line.slice(0, colon).trim();
    const gloss = line.slice(colon + 1).trim();
    const plural = word.endsWith('+');
    if (plural) word = word.slice(0, -1);
    entries.push({ word, gloss, plural });
  }
  return entries;
}

export function parseBonus(text) {
  return text.split(/\s+/).filter(Boolean);
}

export const GLOSS_ENTRIES = parseGlosses(GLOSS_TEXT);
export const BONUS_LIST = parseBonus(BONUS_TEXT);

// word -> gloss for every target-eligible word, plurals included.
export const TARGETS = new Map();
for (const { word, gloss, plural } of GLOSS_ENTRIES) {
  TARGETS.set(word, gloss);
}
for (const { word, plural } of GLOSS_ENTRIES) {
  const many = `${word}s`;
  if (plural && many.length <= MAX_LEN && !TARGETS.has(many)) TARGETS.set(many, `More than one ${word}.`);
}

// Every accepted word: the targets plus the bonus extras.
export const WORDS = new Set(TARGETS.keys());
for (const word of BONUS_LIST) if (word.length >= MIN_LEN && word.length <= MAX_LEN) WORDS.add(word);

export const normalize = (word) => String(word || '').toLowerCase().replace(/[^a-z]/g, '');

export function isWord(word) {
  return WORDS.has(normalize(word));
}

export function isTarget(word) {
  return TARGETS.has(normalize(word));
}

export function glossFor(word) {
  return TARGETS.get(normalize(word)) || null;
}

// Letter tally: 26 counts.
export function tally(letters) {
  const counts = new Array(26).fill(0);
  for (const ch of letters) {
    const k = ch.charCodeAt(0) - 97;
    if (k >= 0 && k < 26) counts[k]++;
  }
  return counts;
}

// True when `word` can be spelled using each of `letters` at most once.
// `letters` is a string, an array of letters, or a tally from tally().
export function canSpell(word, letters) {
  const counts = Array.isArray(letters) && typeof letters[0] === 'number' ? letters.slice() : tally(letters);
  for (const ch of word) {
    const k = ch.charCodeAt(0) - 97;
    if (k < 0 || k >= 26 || --counts[k] < 0) return false;
  }
  return true;
}

// Every word in `pool` (an iterable) spellable from the letters, longest first.
export function spellable(letters, pool = WORDS) {
  const counts = tally(letters);
  const out = [];
  for (const word of pool) {
    if (word.length >= MIN_LEN && word.length <= letters.length && canSpell(word, counts)) out.push(word);
  }
  return out.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}
