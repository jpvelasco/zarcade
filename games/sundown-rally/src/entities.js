// Stats for everything that can appear on a track. Radii and heights are in
// meters; a jeep more than `h` above the ground clears the thing entirely.

export const ZOMBIES = {
  shambler: { r: 0.6, hp: 1, walk: 1.3, damage: 1, score: 10, slow: 0.94 },
  runner: { r: 0.55, hp: 1, walk: 1.8, run: 8.5, chaseRange: 45, damage: 2, score: 15, slow: 0.94 },
  bloater: { r: 1.0, hp: 1, walk: 0.8, damage: 10, score: 25, slow: 0.8, blast: 7.5 },
  brute: { r: 0.9, hp: 4, walk: 1.2, damage: 8, score: 40, slow: 0.35, ramDamage: 2 },
};

export const OBSTACLES = {
  rock: { r: [1.5, 2.4], h: 2.2, damage: 7, slow: 0.35 },
  cactus: { r: [0.6, 0.8], h: 4, damage: 4, slow: 0.82, breakable: true },
  wreck: { r: [2.2, 2.6], h: 1.5, damage: 7, slow: 0.35 },
  barrel: { r: [0.7, 0.7], h: 1.2, damage: 9, slow: 0.7, explosive: true, blast: 7 },
  boulder: { r: [2.0, 2.0], h: 3.2, damage: 10, slow: 0.3, rolling: true },
  building: { r: [5.5, 7], h: 8, damage: 5, slow: 0.2 },
  palm: { r: [0.6, 0.6], h: 9, damage: 5, slow: 0.4 },
  tumbleweed: { r: [0.8, 1.1], h: 1.4, damage: 0, slow: 1, breakable: true, harmless: true },
};

export const PICKUPS = {
  coin: { r: 1.6 },
  nitro: { r: 2.2 },
  repair: { r: 2.2 },
  shield: { r: 2.2, duration: 8 },
  gun: { r: 2.2, ammo: 45 },
  rockets: { r: 2.2, ammo: 3 },
};

export const RAMP = { width: 7, length: 8, height: 1.6 };
