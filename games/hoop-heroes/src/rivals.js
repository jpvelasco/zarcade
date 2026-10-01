// The tournament ladder: four courts, three animal rivals each.
import { timedRules, movingRules, racksRules, MOTIONS } from './modes.js';

export const TOURNAMENT_TIME = 45;
export const RACKS_TIME = 50;

export const RIVALS = [
  { id: 'hops', name: 'Hops', animal: 'bunny', court: 'park', kind: 'timed', diff: 'rookie', color: '#ff8fb8', hello: 'Hi hi hi! I bounce, the ball bounces. Let’s play!', win: 'Wow, you’re fast!', lose: 'Hop hop hooray! Rematch?' },
  { id: 'nutty', name: 'Nutty', animal: 'squirrel', court: 'park', kind: 'moving', motion: 'slide', diff: 'rookie', color: '#ff9a3d', hello: 'This hoop wiggles. Like my tail!', win: 'Nuts! You got me.', lose: 'Acorns for me!' },
  { id: 'bandit', name: 'Bandit', animal: 'raccoon', court: 'park', kind: 'racks', diff: 'pro', color: '#8f9bb3', hello: 'I collect shiny things. Like money balls.', win: 'Fair and square. Take the trophy!', lose: 'Mine! All mine! …want another go?' },
  { id: 'pinch', name: 'Pinch', animal: 'crab', court: 'beach', kind: 'timed', diff: 'pro', color: '#ff5a4f', hello: 'Snip snap! Sideways shots are my thing.', win: 'Clawsome shooting!', lose: 'Snip! Try again, pal.' },
  { id: 'splash', name: 'Splash', animal: 'seal', court: 'beach', kind: 'moving', motion: 'swing', diff: 'pro', color: '#5fb8ff', hello: 'Arf! I balance balls on my nose all day.', win: 'Arf arf! You’re a natural.', lose: 'Arf! One more splash?' },
  { id: 'flora', name: 'Flora', animal: 'flamingo', court: 'beach', kind: 'racks', diff: 'allstar', color: '#ff7fc8', hello: 'Darling, I shoot on one leg.', win: 'Fabulous! The beach trophy is yours.', lose: 'Pink wins! Go again, darling?' },
  { id: 'coo', name: 'Coo', animal: 'pigeon', court: 'roof', kind: 'timed', diff: 'pro', color: '#9b8cff', hello: 'Coo. I live up here. Home court!', win: 'Coo… impressive.', lose: 'Coo coo! Again?' },
  { id: 'alley', name: 'Alley', animal: 'cat', court: 'roof', kind: 'moving', motion: 'bob', diff: 'allstar', color: '#ffd04d', hello: 'Purr. I always land my shots.', win: 'Hiss… nicely done.', lose: 'Meow-velous! Your turn again?' },
  { id: 'rusty', name: 'Rusty', animal: 'fox', court: 'roof', kind: 'racks', diff: 'allstar', color: '#ff7a2f', hello: 'Clever shooters win racks. I’m very clever.', win: 'Outfoxed! The rooftop is yours.', lose: 'Too quick for you! Rematch?' },
  { id: 'orbit', name: 'Orbit', animal: 'monkey', court: 'space', kind: 'timed', diff: 'allstar', color: '#ffb547', hello: 'Ooh ooh! Low gravity makes everything floaty!', win: 'Out of this world!', lose: 'Ooh ooh! Float back for more?' },
  { id: 'cosmo', name: 'Cosmo', animal: 'panda', court: 'space', kind: 'moving', motion: 'zoom', diff: 'champion', color: '#66e0ff', hello: 'The hoop orbits. Can you keep up?', win: 'Stellar! Only the King is left.', lose: 'Bamboo-yah! Try again?' },
  { id: 'leo', name: 'King Leo', animal: 'lion', court: 'space', kind: 'racks', diff: 'champion', color: '#ffcf3a', hello: 'ROAR! Beat me and the Golden Hoop is yours.', win: 'Roar… a new champion! Take the Golden Hoop!', lose: 'The King still rules! Come back anytime.' },
];

export const RIVAL_BY_ID = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
export const LADDER_COURTS = ['park', 'beach', 'roof', 'space'];

export function rivalRules(rival) {
  if (rival.kind === 'moving') return movingRules(rival.court, TOURNAMENT_TIME, MOTIONS[rival.motion]);
  if (rival.kind === 'racks') return racksRules(rival.court, RACKS_TIME);
  return timedRules(rival.court, TOURNAMENT_TIME);
}

export function courtRivals(courtId) {
  return RIVALS.filter((r) => r.court === courtId);
}
