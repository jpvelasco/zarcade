// The post round: five regions of nine handcrafted routes.
//
// How a route is written
// ---------------------
// `ground` is the only thing in absolute world units (y grows downward, so -70
// is 70 m up). Everything else is relative, which keeps the data honest:
//
//   * air sources sit a given height **above the ground** at their x;
//   * rings, letters and hazards sit a given height **above the glide line** —
//     the path a plane flies from the start without ever touching the button.
//
// So a ring with offset 0 is exactly on the lazy line, a ring at +12 asks you
// to find lift, a ring at -10 asks for a dive, and a pair of branches at +14
// and -14 makes a gap you have to aim at. `startH` is produced by
// `scripts/solve-start-heights` (see README) so every route arrives over its
// mailbox with height to spare but not a silly amount.
//
// Item positions are worked out the first time a route is played and then
// cached, so the title and the map cost nothing.

import { createPlane, speedOf, stepPlane, DEFAULT_TUNING } from './flight.js';
import { makeTerrain } from './terrain.js';
import { band, gust, ridge, sunbeam, updraft, rain as raincloud, windAt } from './wind.js';

export const DROP_RADIUS = 7;
export const RING_RADIUS = 9;
const LINE_STEP = 4;          // glide-line samples, in metres
const TAIL = 150;             // flat ground past the mailbox

export const REGIONS = [
  {
    id: 'town',
    name: 'Oakhollow Town',
    subtitle: 'Rooftops, chimney smoke and open windows',
    drop: 'house',
    needStars: 0,
    accent: '#ffb454',
    sky: ['#79c8f7', '#c7e8ff', '#ffe7c4'],
    land: ['#86cf5c', '#5fa94a'],
    breeze: { x: 1.1, y: 0 },
    ceiling: -175,
  },
  {
    id: 'cliffs',
    name: 'Kestrel Cliffs',
    subtitle: 'Sea stacks, ledges and ridge lift',
    drop: 'hut',
    needStars: 12,
    accent: '#5fd0e8',
    sky: ['#5fb6ef', '#aee0ff', '#ffe9d6'],
    land: ['#9bb48f', '#6d8a73'],
    breeze: { x: 1.9, y: 0 },
    ceiling: -215,
  },
  {
    id: 'forest',
    name: 'Fernwood',
    subtitle: 'Tall pines, campfires and paper lanterns',
    drop: 'treehouse',
    needStars: 28,
    accent: '#7fd46a',
    sky: ['#8ccfbe', '#d2eeda', '#fdf0c8'],
    land: ['#5fa756', '#3c7a44'],
    breeze: { x: 0.8, y: 0 },
    ceiling: -190,
  },
  {
    id: 'lake',
    name: 'Mirrorlake',
    subtitle: 'Jetties, boathouses and a long still crossing',
    drop: 'boathouse',
    needStars: 46,
    accent: '#8fb6ff',
    sky: ['#7fadf0', '#c7ddff', '#ffdfe8'],
    land: ['#7fc48f', '#4f9a79'],
    breeze: { x: 1.4, y: 0 },
    ceiling: -215,
  },
  {
    id: 'peaks',
    name: 'Snowcap Pass',
    subtitle: 'Thin air, long glides and the highest letterbox',
    drop: 'cabin',
    needStars: 64,
    accent: '#cfe4ff',
    sky: ['#5f8fd4', '#a6c6ef', '#ffe3f0'],
    land: ['#eaf3ff', '#9fb6d2'],
    breeze: { x: 2.3, y: 0 },
    ceiling: -275,
  },
];

export const regionById = (id) => REGIONS.find((region) => region.id === id);

// ------------------------------------------------------------------ builders
// Air sources are written as `[kind, x, above, ...]` and resolved against the
// ground once the terrain exists.
const U = (x, h = 110, w = 24, s = 5.2) => ['up', x, 0, h, w, s];
const R = (x, h = 135, w = 50, s = 4.6) => ['ridge', x, 0, h, w, s];
const B = (x, above, w, h, s) => ['band', x, above, h, w, s];
const G = (x, above, w, h, s, period = 3.4, phase = 0) => ['gust', x, above, h, w, s, period, phase];
const C = (x, above, w, h, s = 4.2, wet = 1) => ['rain', x, above, h, w, s, wet];
const S = (x, above, w, h, s = 3) => ['sun', x, above, h, w, s];

function resolveAir(spec, terrain) {
  const [kind, x, above, h, w, s, a, b] = spec;
  const ground = terrain.heightAt(x);
  switch (kind) {
    case 'up': return updraft(x, ground - 2, h, w, s);
    case 'ridge': return ridge(x, ground - 2, h, w, s);
    case 'band': return band(x, ground - above, w, h, s);
    case 'gust': return gust(x, ground - above, w, h, s, a, { phase: b });
    case 'rain': return raincloud(x, ground - above, w, h, s, { rain: a });
    case 'sun': return sunbeam(x, ground - above, w, h, s);
    default: throw new Error(`unknown air source ${kind}`);
  }
}

/**
 * The lazy line: where a plane goes if you never touch the button. Sampled
 * every `LINE_STEP` metres so looking a position up is a lookup, not a search.
 */
function glideLine(terrain, air, start, breeze, endX) {
  const plane = createPlane(start);
  const dt = 1 / 30;
  const wind = { x: 0, y: 0, rain: 0, dry: 1, lift: 0 };
  const samples = [plane.y];
  const x0 = start.x;
  let next = x0 + LINE_STEP;
  let time = 0;
  const limit = endX + TAIL;
  while (plane.x < limit && time < 400) {
    windAt(air, plane.x, plane.y, time, breeze, wind);
    stepPlane(plane, dt, { wind, rain: wind.rain, drying: wind.dry, tuning: DEFAULT_TUNING });
    time += dt;
    while (plane.x >= next && next <= limit) {
      samples.push(plane.y);
      next += LINE_STEP;
    }
    if (plane.y > terrain.heightAt(plane.x)) break;   // the lazy line ran out
  }
  // Pad with the ground so lookups past the end still answer something sane.
  while (x0 + (samples.length - 1) * LINE_STEP <= limit) {
    const x = x0 + samples.length * LINE_STEP;
    samples.push(terrain.heightAt(x) - 2);
  }
  const reach = x0 + (samples.length - 1) * LINE_STEP;
  return {
    x0,
    reach,
    flown: plane.x,
    samples,
    at(x) {
      const t = (x - x0) / LINE_STEP;
      if (t <= 0) return samples[0];
      const i = Math.min(samples.length - 2, Math.floor(t));
      const f = t - i;
      return samples[i] + (samples[i + 1] - samples[i]) * f;
    },
  };
}

let autoSeed = 7401;

function route(id, region, name, hint, data) {
  const mailboxX = data.mailbox;
  // Flatten the landing green: everything from a little before the mailbox to
  // the far end of the strip is level mown grass, so a touchdown is fair.
  const greenFrom = mailboxX - 80;
  const greenTo = mailboxX + 420;
  const rough = makeTerrain(data.ground, { kind: data.surface || 'grass' });
  const greenY = Math.round(rough.heightAt(mailboxX));
  const points = data.ground.filter(([x]) => x < greenFrom);
  points.push([greenFrom, greenY, 'grass'], [greenTo, greenY], [greenTo + TAIL, greenY]);
  const terrain = makeTerrain(points, { kind: data.surface || 'grass' });
  autoSeed = (autoSeed * 1103515245 + 12345) >>> 0;

  const self = {
    id,
    region,
    name,
    hint,
    seed: data.seed ?? autoSeed,
    terrain,
    mailbox: { x: mailboxX, y: terrain.heightAt(mailboxX) },
    softSpeed: data.softSpeed ?? 13,
    length: Math.round(mailboxX - (data.startX ?? 16)),
    ceiling: data.ceiling ?? REGIONS[region].ceiling,
    breeze: REGIONS[region].breeze,
    ringCount: (data.rings || []).length,
    letterCount: (data.drops || []).length,
    startH: data.startH ?? 60,
    ready: false,
  };

  const build = () => {
    const startX = data.startX ?? 16;
    const start = {
      x: startX,
      y: terrain.heightAt(startX) - self.startH,
      speed: data.startSpeed ?? 11.2,
      angle: 0.04,
    };
    const air = (data.air || []).map((spec) => resolveAir(spec, terrain));
    const line = glideLine(terrain, air, start, self.breeze, mailboxX);
    self.start = start;
    self.air = air;
    self.line = line;
    self.rings = (data.rings || []).map((entry, index) => {
      const [x, off = 0, r = RING_RADIUS] = Array.isArray(entry) ? entry : [entry];
      return { id: `${id}-r${index}`, x, y: line.at(x) - off, r };
    });
    self.drops = (data.drops || []).map(([x, off = 0], index) => {
      const ground = terrain.heightAt(x);
      // A window has to be on a building, so keep it clear of the ground.
      return { id: `${id}-d${index}`, x, y: Math.min(line.at(x) - off, ground - 7), ground };
    });
    self.hazards = (data.hazards || []).map(([x, off, size, kind = 'branch']) => (kind === 'line'
      ? { x, y: line.at(x) - off, w: size, kind }
      : { x, y: line.at(x) - off, r: size, kind }));
    self.ready = true;
    return self;
  };

  // Resolving a route costs one simulated glide, so routes do it on first use:
  // the title and the map only ever read the counts above.
  self.prepare = () => (self.ready ? self : build());
  for (const key of ['start', 'air', 'line', 'rings', 'drops', 'hazards']) {
    Object.defineProperty(self, key, {
      configurable: true,
      enumerable: true,
      get() {
        build();
        return self[key];
      },
      set(value) {
        Object.defineProperty(self, key, {
          value, writable: true, configurable: true, enumerable: true,
        });
      },
    });
  }
  return self;
}

export const ROUTES = [
  // ----------------------------------------------------------- Oakhollow Town
  route('town-1', 0, 'First Flight', 'Hold to dive, let go to soar. Glide down to the mailbox.', {
    startH: 46,
    ground: [[0, -38], [180, -33], [380, -32], [560, -25], [740, -18], [860, -17]],
    air: [U(240, 110, 26, 4.6), U(520, 105, 24, 4.4)],
    rings: [120, 300, 500, 680],
    drops: [[340, -4]],
    mailbox: 790,
  }),
  route('town-2', 0, 'Milk Street', 'Two windows waiting. Fly close and the letter slips in.', {
    startH: 42,
    ground: [[0, -44], [170, -40], [360, -39], [540, -34], [720, -29], [880, -23], [960, -23]],
    air: [U(210, 110, 24, 5), U(450, 105, 26, 4.8), U(690, 100, 22, 4.6)],
    rings: [110, 290, 470, 650, 780],
    drops: [[300, -6], [610, 4]],
    mailbox: 860,
  }),
  route('town-3', 0, 'Chimney Hop', 'Dive into the smoke: a column lifts hardest near the pots.', {
    startH: 42,
    ground: [[0, -48], [160, -46], [340, -50], [520, -47], [700, -45], [880, -41], [980, -39]],
    air: [U(190, 90, 15, 8.4), U(400, 90, 15, 8.6), U(620, 90, 15, 8.4), U(820, 88, 16, 7.6)],
    rings: [[190, -12], [300, 12], [410, -10], [520, 12], [630, -10], [740, 10], [860, -4]],
    drops: [[470, 2], [720, -2]],
    mailbox: 920,
  }),
  route('town-4', 0, 'Washing Lines', 'Strung across the alley. Slip over or under, never into.', {
    startH: 42,
    ground: [[0, -46], [180, -43], [360, -44], [540, -37], [720, -31], [900, -26], [960, -26]],
    air: [U(220, 110, 24, 5.2), U(480, 105, 24, 5), U(730, 100, 22, 4.6)],
    rings: [130, [300, 12], 480, [650, -10], 800],
    drops: [[370, 6], [640, -4]],
    hazards: [[300, -13, 26, 'line'], [520, 13, 24, 'line'], [740, -13, 22, 'line']],
    mailbox: 880,
  }),
  route('town-5', 0, 'The Clocktower', 'Round the clock face, then down Mill Lane.', {
    startH: 42,
    ground: [[0, -50], [180, -50], [360, -48], [520, -54], [700, -44], [880, -39], [1020, -33]],
    air: [U(210, 110, 24, 5.4), R(430, 120, 44, 3.8), U(680, 105, 24, 5), U(870, 100, 22, 4.8)],
    rings: [120, [300, 10], [430, 16], 570, 730, 890],
    drops: [[360, 8], [770, -4]],
    hazards: [[430, 16, 6, 'birds'], [430, 16, 6, 'birds']],
    mailbox: 960,
  }),
  route('town-6', 0, 'Market Morning', 'The breeze gusts over the square: let it carry you.', {
    startH: 42,
    ground: [[0, -54], [200, -51], [400, -47], [600, -42], [800, -33], [1000, -23], [1080, -24]],
    air: [U(230, 110, 26, 5), G(440, 24, 34, 110, 5.6, 3.2), U(640, 100, 24, 5), G(850, 20, 30, 100, 5, 2.8, 0.4), U(970, 90, 22, 4.6)],
    rings: [130, 320, 480, 660, 840, 970],
    drops: [[390, 6], [710, -4], [910, 4]],
    mailbox: 1020,
  }),
  route('town-7', 0, 'Rooftop Shortcut', 'Thread the gap between the gables. Tight, but fair.', {
    startH: 42,
    ground: [[0, -56], [180, -54], [360, -56], [540, -50], [720, -44], [900, -38], [1060, -34], [1140, -36]],
    air: [U(200, 92, 16, 7.8), U(420, 92, 16, 8), U(650, 92, 16, 7.6), U(880, 90, 16, 7.4)],
    rings: [[200, -10], [330, 12], [440, -10], [570, 12], [680, -10], [810, 10], [960, -4]],
    drops: [[490, 6], [770, -4], [1000, 2]],
    hazards: [[330, -13, 26, 'line'], [570, 18, 6, 'birds'], [830, 13, 24, 'line']],
    mailbox: 1040,
  }),
  route('town-8', 0, 'Evening Round', 'A shower over Bell Street. Wet paper flies like wet paper.', {
    startH: 42,
    ground: [[0, -58], [200, -53], [400, -48], [600, -41], [800, -33], [1000, -24], [1140, -22]],
    air: [U(220, 115, 26, 5.2), C(440, 2, 26, 28, 3.6, 0.85), U(590, 105, 24, 5.4), S(790, 6, 30, 30, 3.2), U(990, 95, 22, 4.6)],
    rings: [130, 310, [440, -22], 610, 800, 990],
    drops: [[360, 8], [700, -4], [920, 4]],
    mailbox: 1080,
  }),
  route('town-9', 0, 'Oakhollow Loop', 'The whole town in one glide. Mind the lines.', {
    startH: 42,
    ground: [[0, -64], [200, -61], [400, -56], [600, -54], [800, -46], [1000, -38], [1180, -29], [1280, -28]],
    air: [U(215, 110, 24, 6), U(440, 92, 17, 8), C(640, 0, 24, 26, 3.4, 0.8), U(720, 105, 24, 5.6), G(910, 22, 32, 110, 5, 3.4), U(1100, 95, 22, 4.8)],
    rings: [130, 310, [440, 14], [640, -24], 790, 900, 1060, 1190],
    drops: [[370, 8], [660, -10], [970, 4], [1150, -2]],
    hazards: [[500, 13, 26, 'line'], [840, -13, 24, 'line'], [1040, 18, 6, 'birds']],
    mailbox: 1220,
  }),

  // ----------------------------------------------------------- Kestrel Cliffs
  route('cliffs-1', 1, 'Over the Harbour', 'Ridge lift hugs the rock. Fly near the cliff and it holds you up.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -70], [140, -73], [260, -80], [310, -61], [470, -63], [530, -54], [700, -55], [860, -56], [960, -58]],
    air: [R(250, 130, 56, 4.4), U(500, 110, 26, 5), U(790, 100, 24, 4.6)],
    rings: [130, 290, [460, 12], 640, 820],
    drops: [[410, 6], [710, -4]],
    mailbox: 900,
  }),
  route('cliffs-2', 1, 'Ridge Riders', 'Stay close to the stone and you barely sink at all.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -82], [150, -86], [280, -92], [330, -74], [480, -75], [540, -67], [700, -74], [860, -70], [1020, -69], [1120, -72]],
    air: [R(260, 140, 60, 4.8), R(700, 120, 46, 4.4), U(930, 105, 26, 4.8)],
    rings: [130, 290, [460, 14], 600, [740, 12], 900, 1020],
    drops: [[440, 8], [820, -6], [1000, 2]],
    mailbox: 1040,
  }),
  route('cliffs-3', 1, 'Gull Gap', 'Two stacks, one gap. The gulls do it every day.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -88], [150, -91], [300, -97], [350, -79], [500, -80], [560, -69], [720, -76], [880, -72], [1060, -74], [1180, -76]],
    air: [R(270, 135, 54, 4.6), U(430, 95, 18, 7.6), R(720, 125, 50, 4.4), U(900, 100, 20, 7)],
    rings: [130, [290, 12], 420, [540, 14], 680, 830, 970, 1100],
    drops: [[310, 10], [580, -8], [1010, 2]],
    hazards: [[420, 16, 6, 'birds'], [420, -17, 7, 'spire'], [830, 16, 6, 'birds'], [830, -17, 7, 'spire']],
    mailbox: 1120,
  }),
  route('cliffs-4', 1, 'Sea Stacks', 'The sea is soft but it ends the round. Keep your paper dry.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -94], [150, -97], [300, -104], [350, -82], [500, -82], [560, -69], [640, -63, 'water'], [760, -63], [810, -81, 'rock'], [900, -80], [950, -69, 'water'], [1080, -69], [1130, -77, 'grass'], [1300, -80]],
    air: [R(260, 130, 50, 4.4), U(480, 110, 26, 5.2), U(700, 105, 26, 5.2), R(850, 115, 34, 4.8), U(1040, 105, 24, 5), U(1230, 100, 24, 4.8)],
    rings: [140, 310, [470, 12], 620, [800, 16], 960, 1100, 1230],
    drops: [[470, 8], [840, 12], [1180, -2]],
    mailbox: 1260,
  }),
  route('cliffs-5', 1, 'Lighthouse Letter', 'Top window of the lighthouse, then down to the quay.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -96], [150, -96], [310, -105], [360, -80], [520, -81], [580, -68], [740, -72], [900, -64], [1060, -61], [1220, -60], [1320, -61]],
    air: [R(280, 140, 58, 4.8), U(530, 115, 26, 5.4), G(810, 24, 32, 110, 5.2, 3), U(1060, 105, 24, 4.8)],
    rings: [140, [300, 12], 470, 620, [800, -12], 970, 1150],
    drops: [[470, 12], [870, -4], [1230, 2]],
    hazards: [[470, -19, 7, 'spire'], [700, 18, 6, 'birds']],
    mailbox: 1240,
  }),
  route('cliffs-6', 1, 'The Chimney Stack', 'A narrow flue of warm air. Dive in, soar out.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -100], [140, -101], [280, -108], [330, -84], [470, -85], [530, -72], [680, -78], [840, -71], [1000, -76], [1160, -69], [1320, -69], [1400, -70]],
    air: [U(210, 94, 14, 9), U(470, 94, 14, 9.2), U(720, 94, 14, 9), U(980, 94, 14, 8.8), U(1230, 100, 22, 5)],
    rings: [[200, -12], [310, 14], [460, -12], [590, 14], [720, -12], [850, 14], [990, -10], [1130, 12], [1280, -4]],
    drops: [[400, 10], [800, -8], [1260, 2]],
    mailbox: 1280,
  }),
  route('cliffs-7', 1, 'Headwind Hollow', 'The wind pushes back in the hollow. Dive to punch through.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -104], [160, -105], [330, -110], [380, -89], [540, -91], [600, -78], [760, -85], [930, -77], [1100, -74], [1260, -72], [1360, -75]],
    air: [R(300, 130, 52, 4.6), B(560, 26, 34, 110, -4.6), U(690, 110, 26, 6), R(810, 120, 44, 4.4), B(1020, 22, 30, 90, -3.8), U(1200, 105, 24, 5.2)],
    rings: [140, [310, 12], 480, 650, [810, 14], 970, 1140, 1290],
    drops: [[330, 10], [720, -6], [1070, 4]],
    mailbox: 1320,
  }),
  route('cliffs-8', 1, 'Cormorant Cove', 'Four letters along the ledges, then the quayside box.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -110], [150, -111], [300, -119], [350, -99], [500, -102], [560, -87], [640, -72, 'water'], [780, -72], [830, -97, 'rock'], [940, -98], [1000, -78, 'water'], [1120, -78], [1170, -92, 'grass'], [1320, -91], [1460, -93]],
    air: [R(270, 135, 48, 4.8), U(500, 115, 28, 5.6), U(710, 110, 28, 5.6), R(880, 120, 38, 4.8), U(1060, 110, 28, 5.4), U(1300, 105, 24, 5), U(1430, 100, 24, 4.8)],
    rings: [140, [300, 12], 470, 630, [870, 14], 1010, 1150, 1290, 1410],
    drops: [[310, 10], [880, 12], [1200, -4], [1400, 2]],
    hazards: [[700, -19, 7, 'spire'], [1060, 18, 6, 'birds']],
    mailbox: 1400,
  }),
  route('cliffs-9', 1, 'Kestrel Crown', 'Off the crown, out along the ridge, down to the harbour.', {
    startH: 38,
    surface: 'rock',
    ground: [[0, -126], [140, -127], [280, -136], [330, -120], [470, -123], [530, -111], [680, -119], [840, -116], [900, -105], [1060, -112], [1220, -111], [1380, -114], [1520, -119]],
    air: [R(260, 150, 54, 5), U(450, 120, 24, 7), R(700, 130, 44, 4.8), U(880, 115, 24, 6.4), R(1080, 120, 40, 4.6), U(1300, 105, 24, 5), U(1470, 100, 24, 4.8)],
    rings: [130, [290, 14], 450, [600, 14], 740, 880, [1020, 12], 1180, 1330, 1460],
    drops: [[400, 12], [820, -8], [1120, 6], [1460, 2]],
    hazards: [[600, -19, 7, 'spire'], [960, 18, 6, 'birds']],
    mailbox: 1480,
  }),

  // ---------------------------------------------------------------- Fernwood
  route('forest-1', 2, 'Under the Canopy', 'Campfire smoke means warm air. Branches mean trouble.', {
    startH: 42,
    ground: [[0, -52], [180, -48], [360, -48], [540, -40], [720, -35], [900, -26], [980, -26]],
    air: [U(220, 110, 24, 5.2), U(490, 105, 24, 5), U(760, 100, 22, 4.8)],
    rings: [130, 310, 490, 670, 850],
    drops: [[360, 6], [630, -4]],
    hazards: [[410, 18, 6, 'birds'], [710, 18, 6, 'birds']],
    mailbox: 940,
  }),
  route('forest-2', 2, 'Campfire Column', 'Three fires, three climbs. Dive low into each one.', {
    startH: 42,
    ground: [[0, -54], [170, -52], [350, -53], [530, -48], [710, -44], [890, -40], [1020, -37]],
    air: [U(200, 90, 15, 8.6), U(440, 90, 15, 8.8), U(680, 90, 15, 8.4), U(890, 92, 18, 6)],
    rings: [[200, -12], [310, 14], [430, -10], [550, 14], [670, -10], [800, 12], [930, -4]],
    drops: [[390, 6], [750, -6]],
    hazards: [[310, -18, 6, 'branch'], [610, 18, 6, 'birds'], [870, 18, 6, 'birds']],
    mailbox: 980,
  }),
  route('forest-3', 2, 'Lantern Lane', 'Lanterns in the treehouse windows. Four letters tonight.', {
    startH: 42,
    ground: [[0, -58], [190, -56], [380, -57], [570, -49], [760, -46], [950, -38], [1080, -34]],
    air: [U(220, 115, 26, 5.4), U(470, 110, 26, 5.2), U(720, 105, 24, 5), U(950, 100, 22, 4.8)],
    rings: [130, 310, 480, 660, 840, 1000],
    drops: [[340, 8], [590, -6], [800, 6], [1010, -2]],
    hazards: [[430, 18, 6, 'birds'], [730, 18, 6, 'birds'], [940, 18, 6, 'birds']],
    mailbox: 1040,
  }),
  route('forest-4', 2, 'Sticky Pines', 'Sap on every branch. Touch one and the round is over.', {
    startH: 42,
    ground: [[0, -60], [180, -58], [370, -59], [560, -52], [750, -46], [940, -38], [1100, -36]],
    air: [U(210, 110, 22, 6), U(450, 105, 22, 5.8), U(700, 105, 22, 5.6), U(920, 100, 22, 5)],
    rings: [130, 300, 470, 630, 800, 970, 1090],
    drops: [[360, 8], [630, -6], [910, 4]],
    hazards: [[250, 18, 6, 'birds'], [400, 18, 6, 'birds'], [550, 18, 6, 'birds'], [710, -18, 6, 'branch'], [860, 18, 6, 'birds'], [1010, 18, 6, 'birds']],
    mailbox: 1060,
  }),
  route('forest-5', 2, 'The Needle Gap', 'Two pines, one slot. Line it up early.', {
    startH: 42,
    ground: [[0, -62], [170, -60], [360, -60], [540, -55], [730, -51], [910, -43], [1080, -38], [1140, -39]],
    air: [U(200, 95, 17, 7.8), U(440, 95, 17, 8), U(680, 95, 17, 7.6), U(910, 100, 20, 6)],
    rings: [[200, -12], [330, 14], [440, -10], [570, 12], [710, -10], [850, 12], [990, -4], [1100, 2]],
    drops: [[440, 6], [750, -6], [1050, 2]],
    hazards: [[330, 16, 6, 'birds'], [330, -16, 6, 'branch'], [610, 16, 6, 'birds'], [610, 16, 6, 'birds'], [910, 16, 6, 'birds'], [910, -16, 6, 'branch']],
    mailbox: 1100,
  }),
  route('forest-6', 2, 'Woodsmoke', 'Smoke lies low in the valley. Follow it and you climb.', {
    startH: 42,
    ground: [[0, -66], [180, -65], [370, -69], [550, -62], [740, -67], [940, -59], [1120, -53], [1200, -49]],
    air: [U(210, 95, 16, 8.4), U(430, 95, 16, 8.6), U(650, 95, 16, 8.2), U(870, 95, 16, 8), U(1110, 100, 22, 5.4)],
    rings: [[200, -12], [310, 14], [420, -12], [540, 14], [650, -12], [780, 14], [890, -10], [1030, 12], [1170, -4]],
    drops: [[360, 8], [700, -6], [1070, 4]],
    hazards: [[270, -18, 6, 'branch'], [490, 18, 6, 'birds'], [710, 18, 6, 'birds'], [950, 18, 6, 'birds']],
    mailbox: 1160,
  }),
  route('forest-7', 2, 'Hollow Log Post', 'A letterbox in a hollow log at the bottom of the glen.', {
    startH: 42,
    ground: [[0, -70], [190, -67], [380, -64], [570, -57], [760, -57], [960, -48], [1160, -37], [1280, -30]],
    air: [U(220, 115, 24, 6), U(470, 110, 24, 5.8), G(680, 26, 32, 110, 5, 3.2), U(900, 105, 22, 5.6), U(1140, 100, 22, 5)],
    rings: [130, 310, 480, 650, 830, 1010, 1180],
    drops: [[370, 8], [710, -6], [1050, 4]],
    hazards: [[270, 18, 6, 'birds'], [550, -18, 6, 'branch'], [910, 18, 6, 'birds'], [1130, 18, 6, 'birds']],
    mailbox: 1220,
  }),
  route('forest-8', 2, 'Fern Rain', 'Rain in the clearing, sun beyond it. Dry off before you land.', {
    startH: 42,
    ground: [[0, -74], [180, -68], [370, -65], [560, -57], [760, -64], [980, -49], [1180, -32], [1320, -28]],
    air: [U(210, 115, 24, 6), C(440, 2, 28, 30, 4, 0.95), U(590, 110, 24, 6), S(790, 6, 30, 30, 3.2), C(980, 0, 24, 26, 3.6, 0.85), U(1180, 105, 22, 5.2)],
    rings: [130, 310, [440, -24], 620, 790, [980, -22], 1120, 1250],
    drops: [[360, 8], [730, -6], [1140, 4]],
    hazards: [[270, 18, 6, 'birds'], [670, 18, 6, 'birds'], [1040, 18, 6, 'birds']],
    mailbox: 1260,
  }),
  route('forest-9', 2, 'Fernwood Deep', 'The long round: smoke, sap, rain and a lantern at the end.', {
    startH: 42,
    ground: [[0, -80], [190, -76], [390, -77], [590, -71], [790, -78], [1000, -68], [1200, -57], [1380, -48], [1460, -47]],
    air: [U(215, 100, 17, 8.4), U(460, 100, 17, 8.6), C(640, 0, 26, 26, 3.8, 0.9), U(730, 105, 22, 6.2), S(920, 6, 28, 30, 3), U(1110, 105, 22, 6), U(1360, 100, 22, 5.2)],
    rings: [[200, -12], [340, 14], [460, -12], [590, 12], [720, -10], [870, 12], [1030, -10], [1210, 10], [1390, -4]],
    drops: [[380, 10], [790, 8], [1120, -6], [1410, 2]],
    hazards: [[290, 18, 6, 'birds'], [530, -18, 6, 'branch'], [860, 18, 6, 'birds'], [1160, 18, 6, 'birds'], [1320, 18, 6, 'birds']],
    mailbox: 1400,
  }),

  // --------------------------------------------------------------- Mirrorlake
  // The lake is flat, so height has to come from the air: a chain of warm
  // columns over the water keeps the lazy line low and the water close.
  route('lake-1', 3, 'Across the Jetty', 'Still water, lazy air. Hop the warm patches across.', {
    startH: 30,
    ground: [[0, -34], [130, -22], [240, -2, 'water'], [730, -2], [810, -8, 'grass'], [960, -4], [1060, -2]],
    air: [U(170, 100, 24, 5.4), U(330, 100, 26, 5), U(480, 100, 26, 5), U(630, 100, 26, 5), U(860, 100, 24, 5)],
    rings: [130, 330, 490, 650, 870],
    drops: [[260, 4], [820, -4]],
    mailbox: 1020,
  }),
  route('lake-2', 3, 'Boathouse Row', 'Three boathouses, three windows. Keep out of the water.', {
    startH: 32,
    ground: [[0, -38], [140, -24], [250, -2, 'water'], [840, -2], [920, -10, 'grass'], [1060, -4], [1160, -2]],
    air: [U(180, 100, 24, 5.6), U(340, 100, 26, 5), B(420, 24, 34, 90, 4.6), U(500, 100, 26, 5), U(660, 100, 26, 5), U(810, 100, 26, 5), U(960, 100, 24, 5)],
    rings: [130, 330, 510, 680, 850, 1050],
    drops: [[290, 4], [630, -6], [1000, 4]],
    hazards: [[440, 18, 6, 'birds'], [760, -18, 6, 'mast']],
    mailbox: 1100,
  }),
  route('lake-3', 3, 'Reed Beds', 'Masts and moorings on the shallow side. Stay a touch higher.', {
    startH: 32,
    ground: [[0, -40], [150, -26], [270, -2, 'water'], [920, -2], [1000, -10, 'grass'], [1140, -4], [1250, -2]],
    air: [U(190, 100, 24, 5.6), U(350, 100, 26, 5), U(500, 100, 26, 5), B(620, 24, 32, 90, 4.6), U(660, 100, 26, 5), U(820, 100, 26, 5), U(1040, 100, 24, 5)],
    rings: [130, 320, 490, 660, 830, 1010, 1170],
    drops: [[340, 4], [720, -6], [1080, 4]],
    hazards: [[560, -18, 6, 'mast'], [900, 18, 6, 'birds']],
    mailbox: 1180,
  }),
  route('lake-4', 3, 'Mirror Calm', 'Barely a breath over the middle. Every metre counts.', {
    startH: 34,
    ground: [[0, -42], [140, -28], [260, -2, 'water'], [1000, -2], [1080, -12, 'grass'], [1220, -4], [1330, -2]],
    air: [U(185, 100, 24, 5.8), U(345, 100, 26, 5), U(500, 100, 26, 5), U(655, 100, 26, 5), U(810, 100, 26, 5), U(950, 100, 26, 5), U(1120, 100, 24, 5)],
    rings: [130, 330, 500, 670, 840, 1010, 1180, 1280],
    drops: [[370, 4], [820, -6], [1260, 2]],
    mailbox: 1260,
  }),
  route('lake-5', 3, 'Squall Line', 'A squall crosses the lake. Go under it or around it.', {
    startH: 36,
    ground: [[0, -46], [150, -30], [270, -2, 'water'], [1020, -2], [1100, -12, 'grass'], [1260, -4], [1370, -2]],
    air: [U(190, 100, 24, 5.8), U(350, 100, 26, 5), C(440, -2, 28, 24, 4.2, 0.9), U(510, 100, 26, 5), U(670, 100, 26, 5), C(790, -4, 24, 22, 3.8, 0.85), U(830, 100, 26, 5), S(930, 8, 28, 26, 3.2), U(990, 100, 26, 5), U(1140, 100, 24, 5)],
    rings: [130, 330, [440, -20], 620, [790, -20], 960, 1140, 1280],
    drops: [[350, 4], [700, -6], [1290, 2]],
    mailbox: 1300,
  }),
  route('lake-6', 3, 'Heron Island', 'An island halfway. Warm rock, warm air, one window.', {
    startH: 32,
    ground: [[0, -42], [140, -28], [260, -2, 'water'], [600, -2], [660, -18, 'grass'], [770, -18], [830, -2, 'water'], [1140, -2], [1220, -12, 'grass'], [1380, -4], [1470, -2]],
    air: [U(190, 100, 24, 5.6), U(350, 100, 26, 5), U(500, 100, 26, 5), U(715, 110, 28, 6.4), U(930, 100, 26, 5), U(1080, 100, 26, 5), U(1260, 100, 24, 5)],
    rings: [130, 330, 510, 715, 900, 1070, 1250, 1390],
    drops: [[360, 4], [715, 8], [1010, -6], [1420, 2]],
    hazards: [[600, 18, 6, 'birds'], [1110, -18, 6, 'mast']],
    mailbox: 1400,
  }),
  route('lake-7', 3, 'The Long Reach', 'The widest crossing. Ride every warm patch you can find.', {
    startH: 38,
    ground: [[0, -50], [140, -32], [260, -2, 'water'], [1200, -2], [1290, -14, 'grass'], [1440, -4], [1550, -2]],
    air: [U(190, 100, 24, 6), U(350, 100, 26, 5), B(430, 26, 36, 90, 5), U(510, 100, 26, 5), U(670, 100, 26, 5), U(830, 100, 26, 5), B(900, 26, 36, 90, 5), U(990, 100, 26, 5), U(1150, 100, 26, 5), U(1330, 100, 24, 5)],
    rings: [130, 340, 510, 680, 850, 1020, 1190, 1350, 1470],
    drops: [[370, 4], [800, -6], [1200, 4]],
    mailbox: 1480,
  }),
  route('lake-8', 3, 'Lantern Floats', 'Paper lanterns on the water. Four letters before dark.', {
    startH: 36,
    ground: [[0, -48], [150, -32], [270, -2, 'water'], [720, -2], [790, -16, 'grass'], [890, -16], [960, -2, 'water'], [1300, -2], [1390, -14, 'grass'], [1540, -4], [1650, -2]],
    air: [U(190, 100, 24, 6), U(350, 100, 26, 5), C(430, -2, 26, 24, 4, 0.85), U(510, 100, 26, 5), U(660, 100, 26, 5), U(840, 110, 28, 6.4), U(1030, 100, 26, 5), U(1190, 100, 26, 5), U(1430, 100, 24, 5)],
    rings: [130, 330, [430, -20], 640, 840, 1030, 1210, 1400, 1540],
    drops: [[360, 4], [840, 8], [1140, -6], [1570, 2]],
    hazards: [[720, 18, 6, 'birds'], [1290, -18, 6, 'mast']],
    mailbox: 1560,
  }),
  route('lake-9', 3, 'Mirrorlake Crossing', 'Shore to shore in one go. Nothing but water underneath.', {
    startH: 40,
    ground: [[0, -54], [140, -36], [260, -2, 'water'], [1440, -2], [1530, -16, 'grass'], [1680, -4], [1800, -2]],
    air: [U(185, 100, 24, 6.2), U(350, 100, 26, 5), B(430, 28, 36, 90, 5.2), U(510, 100, 26, 5), U(670, 100, 26, 5), C(840, -2, 26, 24, 4, 0.85), U(900, 100, 26, 5), U(1060, 100, 26, 5), B(1150, 28, 36, 90, 5.2), U(1220, 100, 26, 5), U(1380, 100, 26, 5), U(1580, 100, 24, 5)],
    rings: [130, 340, 510, 680, [840, -20], 1020, 1230, 1400, 1640],
    drops: [[370, 4], [720, -6], [1170, 4], [1700, 2]],
    mailbox: 1720,
  }),

  // -------------------------------------------------------------- Snowcap Pass
  route('peaks-1', 4, 'First Snow', 'Thin air up here: the paper sinks a touch faster.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -104], [180, -103], [340, -109], [400, -92], [580, -92], [640, -79], [820, -79], [1000, -76], [1140, -78]],
    air: [R(300, 140, 56, 4.6), U(590, 115, 26, 5.4), U(850, 110, 24, 5)],
    rings: [140, [320, 12], 500, 680, 870, 1050],
    drops: [[350, 10], [720, -6]],
    mailbox: 1100,
  }),
  route('peaks-2', 4, 'Cable Car Post', 'A letterbox on the cable-car hut. Mind the wires.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -112], [180, -111], [350, -116], [410, -98], [590, -96], [650, -84], [840, -83], [1020, -79], [1120, -80], [1240, -81]],
    air: [R(310, 140, 54, 4.8), U(600, 120, 26, 5.6), G(790, 26, 32, 110, 5, 3), U(1040, 110, 24, 5.2)],
    rings: [150, [330, 12], 510, 700, 880, 1080, 1190],
    drops: [[360, 10], [750, -6], [1130, 4]],
    hazards: [[470, 13, 32, 'line'], [900, -13, 30, 'line']],
    mailbox: 1180,
  }),
  route('peaks-3', 4, 'Thin Air', 'Weak columns. You will need every one of them.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -120], [190, -118], [370, -122], [430, -111], [610, -115], [670, -102], [860, -112], [1040, -104], [1200, -101], [1320, -104]],
    air: [R(330, 150, 52, 4.4), U(520, 120, 26, 4.6), U(790, 120, 26, 4.6), R(900, 140, 48, 4.4), U(1180, 110, 24, 4.8)],
    rings: [160, [340, 12], 530, 710, [880, 12], 1070, 1250],
    drops: [[370, 10], [800, -6], [1200, 4]],
    mailbox: 1260,
  }),
  route('peaks-4', 4, 'Avalanche Chute', 'Steep, fast and narrow. Hold the dive, then flare.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -132], [150, -133], [290, -139], [340, -120], [480, -122], [540, -106], [700, -106], [740, -93], [900, -103], [1060, -101], [1200, -104], [1340, -106]],
    air: [R(260, 150, 48, 5), U(640, 120, 22, 7.6), R(900, 130, 44, 4.6), U(1140, 110, 24, 5.2)],
    rings: [[150, -10], [310, 14], [450, -12], [590, 14], [720, -12], [860, 14], [1010, -10], [1170, 12], [1300, -4]],
    drops: [[440, 12], [880, -6], [1300, 2]],
    hazards: [[590, -19, 7, 'spire'], [1040, 18, 6, 'birds']],
    mailbox: 1300,
  }),
  route('peaks-5', 4, 'Ice Rings', 'Nine rings of frost. Thread them all for the full round.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -134], [190, -131], [380, -135], [440, -125], [620, -127], [680, -115], [870, -125], [1060, -117], [1240, -112], [1400, -112], [1480, -116]],
    air: [R(340, 150, 52, 4.8), U(530, 120, 24, 5.4), U(810, 120, 24, 5.4), R(910, 140, 48, 4.8), U(1200, 115, 24, 5.2), U(1400, 105, 22, 4.8)],
    rings: [[160, 0], [340, 14], [480, -12], [630, 12], [790, -10], [930, 14], [1090, -8], [1250, 12], [1390, -2]],
    drops: [[390, 12], [800, -6], [1260, 4]],
    mailbox: 1380,
  }),
  route('peaks-6', 4, 'Blizzard Box', 'Snow squalls in the pass. Find the sunny side.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -140], [190, -137], [390, -140], [450, -124], [630, -122], [690, -109], [880, -117], [1080, -106], [1260, -98], [1420, -97], [1520, -99]],
    air: [R(350, 150, 50, 4.8), C(560, 0, 30, 30, 4.4, 0.95), U(690, 120, 24, 5.6), C(910, -2, 28, 28, 4, 0.9), S(1070, 6, 30, 30, 3.4), U(1240, 115, 24, 5.4), U(1430, 105, 22, 4.8)],
    rings: [160, [340, 14], [560, -26], 700, 870, 1050, 1240, 1410],
    drops: [[390, 12], [800, -6], [1250, 4]],
    mailbox: 1460,
  }),
  route('peaks-7', 4, 'The Saddle', 'Over the saddle and down the far side in one long glide.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -152], [170, -150], [330, -156], [390, -145], [560, -145], [620, -134], [800, -144], [980, -137], [1040, -126], [1200, -135], [1380, -132], [1520, -134], [1620, -136]],
    air: [R(300, 160, 52, 5.2), R(560, 150, 46, 5.2), U(760, 125, 24, 6.4), R(1030, 140, 44, 4.8), U(1250, 115, 24, 5.4), U(1480, 105, 22, 5)],
    rings: [160, [330, 14], 500, 670, [830, 12], 1000, 1180, 1350, 1500],
    drops: [[500, 12], [1030, -6], [1500, 2]],
    hazards: [[670, -19, 7, 'spire'], [1200, 18, 6, 'birds']],
    mailbox: 1520,
  }),
  route('peaks-8', 4, 'Eagle Ledge', 'Four cabins strung along the cliff. Letters for all of them.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -158], [180, -155], [360, -162], [420, -151], [600, -154], [660, -142], [840, -152], [1020, -146], [1080, -136], [1260, -145], [1440, -142], [1600, -146], [1700, -148]],
    air: [R(320, 155, 52, 5), U(490, 125, 24, 6), R(600, 150, 46, 5), U(860, 125, 24, 6), R(1090, 140, 44, 4.8), U(1320, 115, 24, 5.6), U(1570, 105, 22, 5)],
    rings: [170, [350, 14], 520, 700, [870, 12], 1050, 1230, 1410, 1580],
    drops: [[370, 12], [730, -6], [1090, 6], [1580, 2]],
    hazards: [[550, 18, 6, 'birds'], [1270, -19, 7, 'spire']],
    mailbox: 1580,
  }),
  route('peaks-9', 4, 'Snowcap Summit Post', 'The highest letterbox in the valley. Everything you know.', {
    startH: 36,
    surface: 'snow',
    ground: [[0, -178], [170, -175], [340, -183], [400, -172], [580, -175], [640, -163], [820, -175], [1000, -171], [1060, -159], [1240, -171], [1420, -164], [1600, -166], [1780, -170], [1900, -173]],
    air: [R(300, 165, 50, 5.4), R(580, 165, 44, 5.4), U(680, 130, 22, 7.4), C(840, 0, 28, 28, 4.2, 0.9), U(980, 130, 24, 6.4), R(1070, 150, 44, 5), S(1240, 6, 30, 30, 3.4), U(1320, 125, 24, 6), R(1440, 145, 42, 4.8), U(1660, 115, 24, 5.6), U(1840, 105, 22, 5)],
    rings: [160, [340, 14], 520, 690, [840, -26], 1030, 1210, 1390, 1560, 1730, 1850],
    drops: [[510, 12], [1030, -6], [1400, 6], [1850, 2]],
    hazards: [[690, -19, 7, 'spire'], [1240, 18, 6, 'birds'], [1600, -19, 7, 'spire']],
    mailbox: 1820,
  }),
];

export const ROUTE_COUNT = ROUTES.length;
export const MAX_STARS = ROUTES.length * 3;

export const routeById = (id) => ROUTES.find((r) => r.id === id);
export const routeIndexById = (id) => ROUTES.findIndex((r) => r.id === id);
export const routesInRegion = (region) => ROUTES.filter((r) => r.region === region);

export const TOTAL_LETTERS = ROUTES.reduce((sum, r) => sum + r.letterCount, 0);
export const TOTAL_RINGS = ROUTES.reduce((sum, r) => sum + r.ringCount, 0);
