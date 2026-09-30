// Power-up capsules. `time` is how long a timed effect lasts (seconds);
// untimed ones act instantly. `weight` sets how often each one drops.
export const POWERUPS = {
  multi: { label: '×3', name: 'Multi-comet!', color: '#5ef2ff', weight: 12 },
  wide: { label: 'WIDE', name: 'Wide ship!', color: '#6dff9e', weight: 12, time: 16 },
  laser: { label: 'LASER', name: 'Laser cannons!', color: '#ff5170', weight: 10, time: 12 },
  sticky: { label: 'CATCH', name: 'Catch!', color: '#b6ff4f', weight: 8, time: 16 },
  slow: { label: 'SLOW', name: 'Slow-mo', color: '#8a9bff', weight: 8, time: 10 },
  fire: { label: 'FIRE', name: 'Fireball!', color: '#ff8a2d', weight: 7, time: 8 },
  shield: { label: 'SHIELD', name: 'Shield barrier', color: '#4fd8ff', weight: 8 },
  life: { label: '1UP', name: 'Extra life!', color: '#ff4fd8', weight: 3 },
  // The silly ones.
  disco: { label: 'DISCO', name: 'Disco party! ×2 points', color: '#ffd84f', weight: 5, time: 10 },
  duck: { label: 'DUCK', name: 'Rubber duck comet', color: '#ffe14f', weight: 4, time: 12 },
  big: { label: 'BIG', name: 'Big comet', color: '#ff9ef0', weight: 6, time: 12 },
  magnet: { label: 'MAGNET', name: 'Capsule magnet', color: '#c58cff', weight: 5, time: 16 },
};

export const POWER_KINDS = Object.keys(POWERUPS);
export const TIMED = POWER_KINDS.filter((k) => POWERUPS[k].time);

export function dropTable(lives) {
  return POWER_KINDS.filter((k) => k !== 'life' || lives < 6).map((k) => [k, POWERUPS[k].weight]);
}
