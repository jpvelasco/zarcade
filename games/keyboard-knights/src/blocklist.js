// Words a kids' typing game must never show. Stored ROT13-encoded so this
// file is not a page of rude words. EXACT entries block a whole word (or a
// whole word inside a phrase); PARTS block fragments anywhere, so they only
// list fragments that never occur in an innocent word (not "ass", which is
// in "glass"). Used by the tests and by the lesson drill generator.
export const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

const EXACT_ROT13 = `
  nff nffrf nefr ohgg ohggf qnza uryy penc cvff fuvg shpx pbpx qvpx phag gvg
  gvgf gjng fyhg juber ovgpu onfgneq snt snttbg anmv cbea frk frkl ahqr anxrq
  encr encrq xvyy xvyyf xvyyre zheqre tha thaf xavsr obzo fubbg fgno qrnq
  qrngu qvr qvrq qvrf qeht qehtf orre jvar obbmr ibqxn ehz tva nyr yntre ubr
  ub oen sneg chxr ibzvg ungr vqvbg fghcvq qhzo zbeba ybfre htyl sng jne
  oybbq tber fcvp puvax xvxr pbba tbbx jbc qlxr ubzb cvzc ubbxre nany nahf
  cravf intvan obbo obbof fcrez frzra ubeal betl yhfg qvyqb obat zrgu pvt
  incr qehax fhvpvqr fynir chffl ohz gheq cbbc fperj fhpx fhpxf wrex sernx
  jrveqb areq svtug chapu fync tebff ones crr cbb qrivy qrzba fngna tubhy
  mbzovr pbecfr tenir pbssva jrncba evsyr ohyyrg neerfg cevfba wnvy pevzr
  guvrs fgrny fung wvmm xxx fbq fbqf cevpx gheqf ovgpurf qnzarq fuvggl
  fghcvqvgl punpx tbqqnza qnza pencf fpnerq fpnel qbbz
`;

const PARTS_ROT13 = `
  shpx fuvg phag avtt cbea juber fyhg ovgpu gjng qvpx pbpx frk snttb
`;

const decode = (text) => text.split(/\s+/).filter(Boolean).map(rot13);

export const BLOCKED_WORDS = new Set(decode(EXACT_ROT13));
export const BLOCKED_PARTS = decode(PARTS_ROT13);

// Every lower-case word inside a string, apostrophes kept ("don't").
export const tokens = (text) => String(text).toLowerCase().match(/[a-z']+/g) || [];

// True when a word, phrase or sentence must not be shown.
export function isBlocked(text) {
  return tokens(text).some((w) => {
    const bare = w.replace(/'/g, '');
    return BLOCKED_WORDS.has(w) || BLOCKED_WORDS.has(bare) || BLOCKED_PARTS.some((part) => bare.includes(part));
  });
}
