// Locker items: balls, jerseys and court themes. Prices are in tickets,
// earned only by playing. Some items come from trophies instead.
export const BALLS = [
  { id: 'classic', name: 'Classic', price: 0, colors: ['#ff8a2a', '#c65512'], seam: '#3a1a08', pattern: 'classic' },
  { id: 'retro', name: 'Retro Stars', price: 60, colors: ['#ff4a5a', '#ffffff', '#3d6bff'], seam: '#1b1f4a', pattern: 'stripes' },
  { id: 'melon', name: 'Watermelon', price: 90, colors: ['#3ec25a', '#1f8a3a'], seam: '#0f5c24', pattern: 'melon' },
  { id: 'beach', name: 'Beach Ball', price: 120, colors: ['#ffffff', '#ff4f6d', '#ffd23f', '#3fb6ff'], seam: '#ffffff', pattern: 'beach' },
  { id: 'planet', name: 'Ringed Planet', price: 160, colors: ['#9b7bff', '#5b3fd1'], seam: '#ffd98a', pattern: 'planet' },
  { id: 'disco', name: 'Disco', price: 220, colors: ['#d8e4ff', '#8aa0d6'], seam: '#ffffff', pattern: 'disco' },
  { id: 'rainbow', name: 'Rainbow', price: 0, trophy: 'beach', colors: ['#ff4f6d', '#ffb03a', '#ffe14d', '#4fd16b', '#3fb6ff', '#9b6bff'], seam: '#ffffff', pattern: 'rainbow' },
  { id: 'gold', name: 'Golden Hoop', price: 0, trophy: 'gold', colors: ['#ffe27a', '#d89a12'], seam: '#7a4a00', pattern: 'classic' },
];

export const JERSEYS = [
  { id: 'sunny', name: 'Sunny', price: 0, body: '#ffcf3a', trim: '#2f6fd6', number: '#2f6fd6' },
  { id: 'grape', name: 'Grape', price: 50, body: '#8a5cff', trim: '#ffe14d', number: '#ffffff' },
  { id: 'mint', name: 'Mint', price: 80, body: '#46e0b0', trim: '#145c4a', number: '#ffffff' },
  { id: 'fire', name: 'Fireball', price: 120, body: '#ff5a3d', trim: '#ffd23f', number: '#ffffff', stripes: true },
  { id: 'galaxy', name: 'Galaxy', price: 180, body: '#1f2a6b', trim: '#7cf0ff', number: '#ffcf3a', stars: true },
  { id: 'zebra', name: 'Zebra', price: 0, trophy: 'roof', body: '#ffffff', trim: '#202020', number: '#202020', stripes: true },
  { id: 'champ', name: 'Champion', price: 0, trophy: 'gold', body: '#ffd23f', trim: '#c2410c', number: '#7a2a00', stars: true },
];

export const COURT_ITEMS = [
  { id: 'park', price: 0 },
  { id: 'beach', price: 0, trophy: 'park' },
  { id: 'roof', price: 0, trophy: 'beach' },
  { id: 'space', price: 0, trophy: 'roof' },
  { id: 'neon', price: 150 },
  { id: 'candy', price: 200, trophy: 'space', orPrice: true },
];

export const LOCKER = { balls: BALLS, jerseys: JERSEYS, courts: COURT_ITEMS };

// Courts unlock by beating the previous court's last rival (the court's own
// trophy unlocks the next), so beach needs the park trophy, etc.
// `orPrice` items can be bought before the trophy is won.
export function itemState(save, kind, item) {
  if (save.owned[kind].includes(item.id)) return 'owned';
  if (item.trophy && save.trophies.includes(item.trophy)) return 'owned';
  if (item.trophy && !item.orPrice) return 'locked';
  return item.price > 0 ? 'buy' : 'owned';
}
