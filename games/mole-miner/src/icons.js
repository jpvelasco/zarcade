// Inline SVG art for museum pieces, upgrade branches and the pod preview.
// Strings only, so the museum can show a silhouette by restyling the same
// shapes.
const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

const BONE = '#f3ead2', BONE_D = '#b5a487';

export const PIECE_ICONS = {
  ammonite: svg(`<circle cx="32" cy="32" r="22" fill="${BONE}" stroke="${BONE_D}" stroke-width="3"/><path d="M32 32m0-16a16 16 0 1 1-14 8a11 11 0 1 1 10 14a6 6 0 1 1 6-6" fill="none" stroke="${BONE_D}" stroke-width="3"/>`),
  trilobite: svg(`<ellipse cx="32" cy="34" rx="16" ry="22" fill="${BONE}" stroke="${BONE_D}" stroke-width="3"/><path d="M32 14v42M20 24h24M18 32h28M18 40h28M20 48h24" stroke="${BONE_D}" stroke-width="2.5"/><circle cx="26" cy="20" r="2.5" fill="${BONE_D}"/><circle cx="38" cy="20" r="2.5" fill="${BONE_D}"/>`),
  fern: svg(`<path d="M32 58C32 40 30 20 34 6" fill="none" stroke="#7aa35a" stroke-width="3"/><g fill="#9ccc72">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${24 - i * 0.5}" cy="${50 - i * 7}" rx="${9 - i}" ry="3" transform="rotate(-25 ${24 - i * 0.5} ${50 - i * 7})"/><ellipse cx="${41 - i * 0.5}" cy="${48 - i * 7}" rx="${9 - i}" ry="3" transform="rotate(25 ${41 - i * 0.5} ${48 - i * 7})"/>`).join('')}</g>`),
  sharktooth: svg(`<path d="M14 18Q32 10 50 18L34 58Q32 62 30 58Z" fill="#fbf6ea" stroke="${BONE_D}" stroke-width="3"/><path d="M20 22Q32 18 44 22" stroke="${BONE_D}" stroke-width="2" fill="none"/>`),
  rexskull: svg(`<path d="M10 30Q12 14 34 14Q54 14 56 30L56 38Q44 40 40 48L16 48Q10 42 10 30Z" fill="${BONE}" stroke="${BONE_D}" stroke-width="3"/><circle cx="40" cy="26" r="5" fill="#3a2a2a"/><path d="M18 48l3 6 3-6 3 6 3-6 3 6 3-6" fill="${BONE}" stroke="${BONE_D}" stroke-width="2"/>`),
  rexribs: svg(`<path d="M32 8v48" stroke="${BONE_D}" stroke-width="5"/>${[14, 24, 34, 44].map((y) => `<path d="M32 ${y}Q14 ${y + 2} 16 ${y + 12}M32 ${y}Q50 ${y + 2} 48 ${y + 12}" fill="none" stroke="${BONE}" stroke-width="4" stroke-linecap="round"/>`).join('')}`),
  rexleg: svg(`<path d="M30 8Q22 20 26 32L22 50L12 54L14 58L32 56L30 50L34 32Q40 20 34 8Z" fill="${BONE}" stroke="${BONE_D}" stroke-width="3"/>`),
  rextail: svg(`<path d="M8 36Q30 20 58 14" fill="none" stroke="${BONE}" stroke-width="8" stroke-linecap="round"/>${[14, 24, 34, 44].map((x, i) => `<circle cx="${x}" cy="${32 - i * 5}" r="${5 - i * 0.6}" fill="${BONE}" stroke="${BONE_D}" stroke-width="2"/>`).join('')}`),
  geode: svg(`<ellipse cx="32" cy="34" rx="22" ry="20" fill="#7a6a5a"/><ellipse cx="32" cy="34" rx="16" ry="14" fill="#5d3f8f"/><path d="M20 40l6-12 4 10 4-14 4 12 6-8" fill="#c7a8ff" stroke="#efe0ff" stroke-width="1.5"/>`),
  prism: svg(`<path d="M32 8L54 50H10Z" fill="#9fe8ff" stroke="#e8fbff" stroke-width="3"/><path d="M40 30L60 26M42 36L60 38M40 42L58 50" stroke-width="3" stroke="#ff6bd5"/><path d="M42 36L60 38" stroke="#ffd84a" stroke-width="3"/>`),
  crown: svg(`<path d="M10 46L14 18L24 32L32 12L40 32L50 18L54 46Z" fill="#c7a8ff" stroke="#efe0ff" stroke-width="3"/><rect x="10" y="46" width="44" height="8" rx="3" fill="#a07ae0"/><circle cx="32" cy="38" r="4" fill="#7fe6ff"/>`),
  bell: svg(`<path d="M18 46Q18 18 32 16Q46 18 46 46Z" fill="#7fe6ff" stroke="#e8fbff" stroke-width="3"/><rect x="14" y="44" width="36" height="6" rx="3" fill="#5ac8ee"/><circle cx="32" cy="54" r="4" fill="#c7a8ff"/><path d="M50 22q6 4 6 10M54 16q8 6 8 16" fill="none" stroke="#c7a8ff" stroke-width="2.5"/>`),
  lantern: svg(`<rect x="22" y="16" width="20" height="30" rx="8" fill="#44f0d0" stroke="#d8fff4" stroke-width="3"/><path d="M26 10h12M32 10v6M24 46h16v6H24z" stroke="#2a6a68" stroke-width="3" fill="#2a6a68"/><circle cx="32" cy="31" r="5" fill="#eafff9"/>`),
  flute: svg(`<path d="M10 50L52 10" stroke="#a0784a" stroke-width="8" stroke-linecap="round"/>${[0, 1, 2, 3].map((i) => `<circle cx="${22 + i * 8}" cy="${39 - i * 7.6}" r="2.4" fill="#3a2410"/>`).join('')}<path d="M52 10q6-2 6 6" stroke="#9dffb0" stroke-width="2.5" fill="none"/>`),
  caphat: svg(`<path d="M6 40Q8 14 32 12Q56 14 58 40Z" fill="#ff5fa8" stroke="#ffd0ea" stroke-width="3"/><circle cx="22" cy="26" r="4" fill="#ffd0ea"/><circle cx="38" cy="22" r="3.5" fill="#ffd0ea"/><circle cx="46" cy="32" r="3" fill="#ffd0ea"/><rect x="18" y="40" width="28" height="6" rx="3" fill="#e8f6e0"/>`),
  glowmap: svg(`<path d="M10 14L24 10L40 16L54 12V50L40 54L24 48L10 52Z" fill="#e8dcb8" stroke="#a8977a" stroke-width="3"/><path d="M18 22Q28 30 26 38T44 42" fill="none" stroke="#44f0d0" stroke-width="3" stroke-dasharray="4 3"/><path d="M42 38l4 4m0-4l-4 4" stroke="#ff5fa8" stroke-width="3"/>`),
  emberidol: svg(`<rect x="20" y="22" width="24" height="32" rx="6" fill="#8a3a22" stroke="#ffb070" stroke-width="3"/><circle cx="27" cy="34" r="3" fill="#ffd84a"/><circle cx="37" cy="34" r="3" fill="#ffd84a"/><path d="M26 44h12" stroke="#ffd84a" stroke-width="3"/><path d="M32 22Q24 14 30 6Q32 12 36 10Q40 16 32 22Z" fill="#ff7a2e"/>`),
  dragonscale: svg(`<path d="M32 6Q54 18 50 40Q44 56 32 58Q20 56 14 40Q10 18 32 6Z" fill="#ff5a3c" stroke="#ffd0a0" stroke-width="3"/><path d="M20 30Q32 20 44 30M18 42Q32 32 46 42" fill="none" stroke="#ffb070" stroke-width="3"/>`),
  magmabowl: svg(`<path d="M8 28H56Q54 52 32 54Q10 52 8 28Z" fill="#4a2e2e" stroke="#ff8a4c" stroke-width="3"/><ellipse cx="32" cy="28" rx="24" ry="6" fill="#ff7a2e"/><ellipse cx="26" cy="27" rx="6" ry="2" fill="#ffe27a"/>`),
  feather: svg(`<path d="M50 8Q20 14 14 50L18 54Q46 46 50 8Z" fill="#ffa23c" stroke="#fff1a0" stroke-width="3"/><path d="M48 12L14 56" stroke="#d4471e" stroke-width="2.5"/><path d="M40 18l-8 2M36 26l-10 2M30 34l-10 2" stroke="#ff5a3c" stroke-width="2"/>`),
  sundisk: svg(`<circle cx="32" cy="32" r="16" fill="#ffd84a" stroke="#fff5c0" stroke-width="3"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${32 + Math.cos(a) * 20} ${32 + Math.sin(a) * 20}L${32 + Math.cos(a) * 28} ${32 + Math.sin(a) * 28}" stroke="#ffb02e" stroke-width="4" stroke-linecap="round"/>`; }).join('')}<circle cx="32" cy="32" r="6" fill="#ffb02e"/>`),
  moonkey: svg(`<path d="M30 10A14 14 0 1 0 30 38A10 10 0 1 1 30 10Z" fill="#e8eef8" stroke="#aebcff" stroke-width="3"/><path d="M28 36V58M28 50h8M28 56h6" stroke="#aebcff" stroke-width="5" stroke-linecap="round"/>`),
  startablet: svg(`<rect x="14" y="8" width="36" height="48" rx="6" fill="#a58a55" stroke="#ffe08a" stroke-width="3"/><path d="M32 18l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#fff2a8"/><path d="M20 46h24M22 51h20" stroke="#6f5a33" stroke-width="2.5"/>`),
  moleking: svg(`<rect x="14" y="50" width="36" height="8" rx="2" fill="#a58a55"/><circle cx="32" cy="34" r="15" fill="#ecc65e" stroke="#fff2a8" stroke-width="3"/><ellipse cx="44" cy="36" rx="5" ry="4" fill="#ffb02e"/><circle cx="34" cy="31" r="2" fill="#6f5a33"/><path d="M20 20L22 10L28 16L32 8L36 16L42 10L44 20Z" fill="#ffd84a" stroke="#fff2a8" stroke-width="2"/>`),
};

export const BRANCH_ICONS = {
  drill: svg(`<path d="M8 22h22v20H8z" fill="#ffc93c" stroke="#a8822c" stroke-width="3"/><path d="M30 18L58 32L30 46Z" fill="#c9d2e6" stroke="#5a6278" stroke-width="3"/><path d="M38 24l4 16M46 28l2 8" stroke="#5a6278" stroke-width="3"/>`),
  tank: svg(`<rect x="16" y="14" width="32" height="42" rx="6" fill="#e83c3c" stroke="#7a1414" stroke-width="3"/><rect x="34" y="6" width="12" height="10" rx="2" fill="#ffd24a"/><path d="M24 36h16M32 28v16" stroke="#fff" stroke-width="4"/>`),
  cargo: svg(`<path d="M10 24h44l-4 30H14z" fill="#b8743a" stroke="#5a3416" stroke-width="3"/><path d="M10 24l8-12h28l8 12" fill="#d89458" stroke="#5a3416" stroke-width="3"/><path d="M26 30l6 8 6-8" fill="#c66bff" stroke="#fff" stroke-width="2"/>`),
  hull: svg(`<path d="M32 6L54 14V32Q54 50 32 58Q10 50 10 32V14Z" fill="#6fa8ff" stroke="#2f5fc4" stroke-width="3"/><path d="M22 32l8 8 14-16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`),
  lamp: svg(`<path d="M24 40Q12 30 18 18Q24 8 32 8Q40 8 46 18Q52 30 40 40Z" fill="#fff4b8" stroke="#e0a81e" stroke-width="3"/><rect x="24" y="40" width="16" height="12" rx="3" fill="#8c84a0"/><path d="M28 56h8" stroke="#8c84a0" stroke-width="4"/>`),
  prop: svg(`<ellipse cx="18" cy="24" rx="14" ry="6" fill="#e8eef8" stroke="#5a6278" stroke-width="3"/><ellipse cx="46" cy="24" rx="14" ry="6" fill="#e8eef8" stroke="#5a6278" stroke-width="3"/><circle cx="32" cy="24" r="5" fill="#ff6b8b"/><path d="M32 30v24" stroke="#5a6278" stroke-width="5"/>`),
  fan: svg(`<circle cx="32" cy="32" r="24" fill="#bfefff" stroke="#3f9fd6" stroke-width="3"/>${[0, 1, 2].map((i) => `<path d="M32 32Q${32 + 18 * Math.cos(i * 2.094)} ${32 + 18 * Math.sin(i * 2.094)} ${32 + 20 * Math.cos(i * 2.094 + 0.8)} ${32 + 20 * Math.sin(i * 2.094 + 0.8)}Z" fill="#3f9fd6"/>`).join('')}<path d="M32 10v8M32 46v8M10 32h8M46 32h8" stroke="#fff" stroke-width="3"/>`),
};

export function podIcon(paint) {
  const body = paint.rainbow ? 'url(#rb)' : paint.body;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="rb" x1="0" x2="1"><stop offset="0" stop-color="#ff6bd5"/><stop offset=".33" stop-color="#ffd84a"/><stop offset=".66" stop-color="#5ef2a0"/><stop offset="1" stop-color="#5ec8ff"/></linearGradient></defs>
<path d="M84 52l20 8-20 8z" fill="#c9d2e6" stroke="#5a6278" stroke-width="2"/>
<rect x="14" y="70" width="72" height="18" rx="9" fill="#2b2533"/>
<rect x="12" y="40" width="76" height="36" rx="14" fill="${paint.trim}"/>
<rect x="12" y="38" width="76" height="32" rx="14" fill="${body}"/>
<rect x="12" y="60" width="76" height="4" fill="${paint.trim}"/>
<path d="M26 38a20 20 0 0 1 40 0z" fill="#a0dcff" opacity=".6"/>
<circle cx="46" cy="34" r="10" fill="#5b4a5e"/><ellipse cx="54" cy="36" rx="4" ry="3" fill="#ff8fb0"/>
<path d="M36 30a10 10 0 0 1 20 0z" fill="#ffd24a"/>
<ellipse cx="32" cy="16" rx="13" ry="3" fill="#e8eef8"/><ellipse cx="60" cy="16" rx="13" ry="3" fill="#e8eef8"/><path d="M46 16v20" stroke="#5a6278" stroke-width="3"/></svg>`;
}

export const MOLE_LOGO = `<svg viewBox="0 0 120 100" aria-hidden="true">
<ellipse cx="60" cy="92" rx="44" ry="6" fill="rgba(0,0,0,.25)"/>
<path d="M98 54l20 8-20 8z" fill="#c9d2e6" stroke="#5a6278" stroke-width="2"/>
<rect x="22" y="72" width="76" height="18" rx="9" fill="#2b2533"/>
<circle cx="34" cy="81" r="5" fill="#4a4258"/><circle cx="52" cy="81" r="5" fill="#4a4258"/><circle cx="70" cy="81" r="5" fill="#4a4258"/><circle cx="88" cy="81" r="5" fill="#4a4258"/>
<rect x="20" y="40" width="80" height="38" rx="15" fill="#e2902a"/>
<rect x="20" y="38" width="80" height="34" rx="15" fill="#ffc93c"/>
<rect x="26" y="42" width="52" height="6" rx="3" fill="rgba(255,255,255,.4)"/>
<path d="M36 40a22 22 0 0 1 44 0z" fill="#a0dcff" opacity=".55"/>
<circle cx="58" cy="34" r="12" fill="#5b4a5e"/><circle cx="61" cy="38" r="7" fill="#7a6880"/>
<ellipse cx="67" cy="36" rx="5" ry="4" fill="#ff8fb0"/><circle cx="60" cy="31" r="1.8" fill="#1a1420"/><circle cx="66" cy="30" r="1.6" fill="#1a1420"/>
<path d="M46 30a12 12 0 0 1 24 0z" fill="#ffd24a"/><circle cx="61" cy="23" r="3.4" fill="#fff6c8"/>
<path d="M36 40a22 22 0 0 1 44 0" fill="none" stroke="#fff" stroke-width="2.5"/>
<rect x="56" y="10" width="4" height="10" fill="#5a6278"/><ellipse cx="44" cy="10" rx="15" ry="3.5" fill="#e8eef8"/><ellipse cx="72" cy="10" rx="15" ry="3.5" fill="#e8eef8"/><circle cx="58" cy="10" r="3.5" fill="#ff6b8b"/>
<circle cx="94" cy="56" r="4" fill="#fff4b8"/></svg>`;
