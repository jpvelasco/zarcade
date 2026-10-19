// The five bot personalities, easiest first. Search settings are in ai.js
// (LEVELS); this file is names, faces, and what they say.
export const BOTS = [
  {
    id: 'pip', name: 'Pip the Pawn', short: 'Pip', skill: 1, color: '#7bd36a',
    blurb: 'Brand new to chess. Makes silly moves on purpose!',
    lines: {
      hello: ['Hi! I just learned how the horsey moves!', 'Let\'s play! I\'ll try my best!', 'Ooh, chess! My favourite!'],
      capture: ['Gotcha!', 'Yum, a piece!', 'I took one!'],
      captured: ['Hey! I needed that!', 'Oopsie!', 'Aww, my piece!'],
      check: ['Check! Did I do that right?', 'Check! Hee hee!'],
      checked: ['Eek! My king!', 'Uh oh!'],
      win: ['I won?! Wow!', 'Yay! Good game!'],
      lose: ['You\'re really good! Again?', 'Good game! Teach me that trick!'],
      draw: ['A tie! We both win!'],
    },
  },
  {
    id: 'bella', name: 'Bella Bunny', short: 'Bella', skill: 2, color: '#ff9ccb',
    blurb: 'Hops around the board. Loves to grab pieces.',
    lines: {
      hello: ['Hop hop! Ready to play?', 'I brought carrots for the winner!', 'Bunny power, activate!'],
      capture: ['Hop! Mine now!', 'Nom nom!', 'Quick as a bunny!'],
      captured: ['My ears are drooping…', 'Hmph! Fine!', 'That was my favourite piece!'],
      check: ['Check! Hop to it!', 'Boing! Check!'],
      checked: ['Yikes, a check!', 'My whiskers are twitching!'],
      win: ['Hop hop hooray!', 'The carrots are mine!'],
      lose: ['You out-hopped me! Well played!', 'Have a carrot, champ!'],
      draw: ['A bunny tie!'],
    },
  },
  {
    id: 'captain', name: 'Captain Rook', short: 'Captain', skill: 3, color: '#ffb84a',
    blurb: 'A salty old sea rook. Knows a few tricks.',
    lines: {
      hello: ['Ahoy! Prepare to be boarded!', 'All hands on deck!', 'Arr, a worthy opponent!'],
      capture: ['Into the brig with ye!', 'Plunder!', 'Arr, that one\'s mine!'],
      captured: ['Blimey!', 'Man overboard!', 'Shiver me timbers!'],
      check: ['Check, matey!', 'Fire the cannons! Check!'],
      checked: ['Batten down the hatches!', 'A broadside!'],
      win: ['Victory on the high seas!', 'Arr, the treasure is mine!'],
      lose: ['Ye sank my ship! Well sailed!', 'I surrender, captain!'],
      draw: ['A stalemate at sea, arr.'],
    },
  },
  {
    id: 'fox', name: 'Professor Fox', short: 'Prof. Fox', skill: 4, color: '#ff7a4a',
    blurb: 'A clever fox with a plan for every move.',
    lines: {
      hello: ['A pleasure. Shall we begin the lesson?', 'Let us see what you have learned.', 'Chess is a puzzle. Let\'s solve it.'],
      capture: ['Elementary.', 'As planned.', 'A small advantage.'],
      captured: ['Interesting choice!', 'Hmm, I missed that.', 'Clever!'],
      check: ['Check. Think carefully.', 'Check, my friend.'],
      checked: ['Ah, well found.', 'A sharp move!'],
      win: ['Class dismissed!', 'A fine game. Study it!'],
      lose: ['Top marks! You beat the professor!', 'Excellent work, I am impressed.'],
      draw: ['A draw: a fair result.'],
    },
  },
  {
    id: 'owl', name: 'Grandmaster Owl', short: 'Owl', skill: 5, color: '#c78bff',
    blurb: 'The wisest bird in the forest. Very hard to beat!',
    lines: {
      hello: ['Hoo goes there? Let us play.', 'The night is long. Hoo-hoo.', 'Show me your best moves.'],
      capture: ['Hoo!', 'A wise exchange.', 'Swooped!'],
      captured: ['Hoo! Well seen.', 'Most unexpected.', 'A sharp eye you have.'],
      check: ['Check. Hoo-hoo.', 'Check, little one.'],
      checked: ['Hoo! Bold.', 'A fine check.'],
      win: ['Hoo-hoo! Keep practising, you\'ll get there.', 'Wisdom wins tonight.'],
      lose: ['Hoo! You beat the Grandmaster! Amazing!', 'The student becomes the master!'],
      draw: ['A draw against an owl is no small thing.'],
    },
  },
];

export const FRIEND = { id: 'friend', name: 'A friend', short: 'Friend', color: '#5ec8ff', blurb: 'Pass and play on one device.' };

export function pickLine(bot, kind, rand = Math.random) {
  const list = bot?.lines?.[kind];
  if (!list || !list.length) return '';
  return list[Math.floor(rand() * list.length) % list.length];
}

// Avatars as small inline SVGs (100x100), drawn with simple shapes.
export function avatarSvg(id) {
  const eyes = (y = 46, dx = 12, cx = 50) => `<circle cx="${cx - dx}" cy="${y}" r="6" fill="#fff"/><circle cx="${cx + dx}" cy="${y}" r="6" fill="#fff"/><circle cx="${cx - dx + 1.5}" cy="${y + 1}" r="3.2" fill="#1d1430"/><circle cx="${cx + dx + 1.5}" cy="${y + 1}" r="3.2" fill="#1d1430"/>`;
  const smile = (y = 60) => `<path d="M40 ${y} q10 9 20 0" stroke="#1d1430" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  const wrap = (bg, body) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="${bg}"/>${body}</svg>`;
  switch (id) {
    case 'pip':
      return wrap('#d9f5c8', `<path d="M30 88 Q32 70 40 64 L60 64 Q68 70 70 88 Z" fill="#fff7e8" stroke="#3a2a1a" stroke-width="3"/><ellipse cx="50" cy="63" rx="15" ry="5" fill="#fff7e8" stroke="#3a2a1a" stroke-width="3"/><circle cx="50" cy="44" r="19" fill="#fff7e8" stroke="#3a2a1a" stroke-width="3"/>${eyes(42, 7)}<path d="M44 52 q6 6 12 0" stroke="#1d1430" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="37" cy="50" r="3.5" fill="#ffadc6"/><circle cx="63" cy="50" r="3.5" fill="#ffadc6"/>`);
    case 'bella':
      return wrap('#ffe1ef', `<ellipse cx="38" cy="22" rx="8" ry="20" fill="#fff" stroke="#c76b98" stroke-width="3"/><ellipse cx="62" cy="22" rx="8" ry="20" fill="#fff" stroke="#c76b98" stroke-width="3"/><ellipse cx="38" cy="24" rx="3.5" ry="13" fill="#ffb3d2"/><ellipse cx="62" cy="24" rx="3.5" ry="13" fill="#ffb3d2"/><ellipse cx="50" cy="58" rx="27" ry="25" fill="#fff" stroke="#c76b98" stroke-width="3"/>${eyes(52, 11)}<ellipse cx="50" cy="63" rx="4" ry="3" fill="#ff7aae"/><path d="M50 66 v4 M44 72 q6 4 12 0" stroke="#1d1430" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="33" cy="64" r="4" fill="#ffc2dc"/><circle cx="67" cy="64" r="4" fill="#ffc2dc"/>`);
    case 'captain':
      return wrap('#ffe9c2', `<path d="M28 90 L30 46 L70 46 L72 90 Z" fill="#9aa3b5" stroke="#2c3344" stroke-width="3"/><path d="M26 46 V30 h10 v7 h9 v-7 h10 v7 h9 v-7 h10 v16 Z" fill="#b6bfd0" stroke="#2c3344" stroke-width="3"/><path d="M20 30 Q50 6 80 30 Z" fill="#2b2b3c"/><circle cx="50" cy="21" r="5" fill="#fff"/>${eyes(60, 11)}<path d="M33 54 l12 6" stroke="#1d1430" stroke-width="4" stroke-linecap="round"/><circle cx="39" cy="60" r="7.5" fill="#1d1430"/>${smile(73)}`);
    case 'fox':
      return wrap('#ffe0cc', `<path d="M20 22 L38 40 L28 52 Z M80 22 L62 40 L72 52 Z" fill="#ff7a3c" stroke="#7a2e10" stroke-width="3" stroke-linejoin="round"/><path d="M22 44 Q50 20 78 44 Q76 74 50 88 Q24 74 22 44 Z" fill="#ff8a4c" stroke="#7a2e10" stroke-width="3"/><path d="M32 60 Q50 92 68 60 Q50 70 32 60 Z" fill="#fff6ec"/>${eyes(52, 12)}<circle cx="38" cy="52" r="10" fill="none" stroke="#3a2a1a" stroke-width="2.5"/><circle cx="62" cy="52" r="10" fill="none" stroke="#3a2a1a" stroke-width="2.5"/><path d="M48 52 h4" stroke="#3a2a1a" stroke-width="2.5"/><ellipse cx="50" cy="70" rx="5" ry="3.5" fill="#1d1430"/>`);
    case 'owl':
      return wrap('#e6dcff', `<path d="M24 30 L34 40 M76 30 L66 40" stroke="#4a2f7a" stroke-width="5" stroke-linecap="round"/><ellipse cx="50" cy="58" rx="30" ry="32" fill="#8c63c9" stroke="#3b2266" stroke-width="3"/><ellipse cx="50" cy="70" rx="17" ry="17" fill="#c9b4f0"/><circle cx="38" cy="48" r="11" fill="#fff" stroke="#3b2266" stroke-width="2.5"/><circle cx="62" cy="48" r="11" fill="#fff" stroke="#3b2266" stroke-width="2.5"/><circle cx="39" cy="49" r="5" fill="#1d1430"/><circle cx="63" cy="49" r="5" fill="#1d1430"/><path d="M45 58 L50 66 L55 58 Z" fill="#ffb84a" stroke="#7a4a10" stroke-width="2"/><path d="M30 26 h40 l-6 -8 h-28 Z" fill="#2b2b3c"/><path d="M70 26 l8 10" stroke="#ffd84f" stroke-width="3"/>`);
    case 'you':
      return wrap('#d7f0ff', `<circle cx="50" cy="44" r="20" fill="#ffe0bd" stroke="#6b4a2a" stroke-width="3"/><path d="M30 40 Q34 20 50 22 Q66 20 70 40 Q60 30 50 32 Q40 30 30 40 Z" fill="#6b4a2a"/>${eyes(45, 8)}${smile(53)}<path d="M24 92 Q28 68 50 68 Q72 68 76 92 Z" fill="#5ec8ff" stroke="#1f5f87" stroke-width="3"/>`);
    default:
      return wrap('#d7f0ff', `<circle cx="38" cy="46" r="13" fill="#ffe0bd" stroke="#6b4a2a" stroke-width="2.5"/><circle cx="64" cy="46" r="13" fill="#f2c79a" stroke="#6b4a2a" stroke-width="2.5"/><circle cx="34" cy="45" r="2" fill="#1d1430"/><circle cx="42" cy="45" r="2" fill="#1d1430"/><circle cx="60" cy="45" r="2" fill="#1d1430"/><circle cx="68" cy="45" r="2" fill="#1d1430"/><path d="M18 90 Q20 64 38 64 Q50 64 52 74 Q54 64 64 64 Q82 64 84 90 Z" fill="#7bd36a" stroke="#2f6b24" stroke-width="3"/>`);
  }
}
