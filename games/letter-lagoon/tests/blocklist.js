// The blocklist for the word lists: words a kids game must never accept.
// Stored ROT13-encoded so this file is not a page of rude words; decode()
// turns it back. EXACT words are rejected outright. SUBSTRINGS are rejected
// anywhere inside a word, so only list fragments that never appear in an
// innocent word (not "ass", which is in "glass", or "rape", in "grape").
export const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

const EXACT_ROT13 = `
  nff nefr ohgg qnza uryy penc cvff fuvg shpx pbpx qvpx phag gvg gvgf gjng
  fyhg juber ovgpu onfgneq snt anmv cbea frk frkl ahqr anxrq encr encrq xvyy
  xvyyf xvyyre zheqre tha thaf xavsr obzo fubbg fgno qrnq qrngu qvr qvrq qvrf
  qeht qehtf orre jvar obbmr ibqxn ehz tva nyr yntre ubr ub oen sneg chxr
  ibzvg ungr vqvbg fghcvq qhzo zbeba ybfre htyl sng jne oybbq tber fcvp puvax
  xvxr pbba tbbx jbc qlxr ubzb cvzc ubbxre nany nahf cravf intvan obbo obbof
  fcrez frzra ubeal betl yhfg qvyqb obat zrgu pvt incr qehax fhvpvqr fynir
  chffl ohz gheq cbbc fperj fhpx fhpxf tbq wrex sernx jrveqb areq svtug chapu
  fync tebff ones crr cbb qrivy qrzba fngna tubhy mbzovr pbecfr tenir pbssva
  jrncba evsyr ohyyrg neerfg cevfba wnvy pevzr guvrs fgrny
`;

const SUBSTRINGS_ROT13 = `
  shpx fuvg phag avtt cbea juber fyhg ovgpu gjng qvpx pbpx frk
`;

const decode = (text) => text.split(/\s+/).filter(Boolean).map(rot13);

export const BLOCKED_WORDS = new Set(decode(EXACT_ROT13));
export const BLOCKED_PARTS = decode(SUBSTRINGS_ROT13);

// True when a word must not be in a kids word list.
export function isBlocked(word) {
  const w = String(word).toLowerCase();
  if (BLOCKED_WORDS.has(w)) return true;
  return BLOCKED_PARTS.some((part) => w.includes(part));
}
