// The prop library. Every prop is drawn in code (see art.js); this file holds
// only the geometry the scene builder and the tests need, so it stays DOM-free.
//
//   fam    family, so a room can ask for "something shelf-shaped" here
//   w      [min, max] width in world units (a room is 1000 tall)
//   ratio  [min, max] height / width
//   layer  draw layer: 1 wall and ceiling, 2 furniture, 3 rugs, 4 floor clutter,
//          5 front (curtains, crates to peek around), 6 cobwebs and dust
//   solid  rects [x, y, w, h] in fractions of the prop box that visually block
//          whatever is drawn behind them. [] means see-through decoration.
//   slots  [fx, fy, kind] spots on this prop where a small thing can hide,
//          in fractions of the prop box.
//   base   'floor' sits on the floor line, 'wall' hangs at the given y,
//          'ceiling' hangs from the top.

const FULL = [[0, 0, 1, 1]];

const defs = [
  // --------------------------------------------------------- shelf units
  { id: 'bookcase', fam: 'shelf', w: [230, 300], ratio: [1.5, 1.95], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.28, 0.17, 'shelf'], [0.72, 0.17, 'shelf'], [0.5, 0.44, 'shelf'], [0.2, 0.7, 'shelf'], [0.8, 0.7, 'shelf'], [0.5, 0.03, 'high']] },
  { id: 'bookcaseWide', fam: 'shelf', w: [340, 430], ratio: [0.9, 1.2], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.2, 0.2, 'shelf'], [0.5, 0.2, 'shelf'], [0.8, 0.2, 'shelf'], [0.3, 0.62, 'shelf'], [0.72, 0.62, 'shelf'], [0.5, 0.03, 'high']] },
  { id: 'cabinet', fam: 'shelf', w: [210, 275], ratio: [1.2, 1.5], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.3, 0.22, 'shelf'], [0.7, 0.22, 'shelf'], [0.5, 0.03, 'high'], [0.12, 0.9, 'nook']] },
  { id: 'dresser', fam: 'shelf', w: [250, 330], ratio: [0.7, 0.95], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.25, 0.03, 'high'], [0.62, 0.03, 'high'], [0.5, 0.3, 'table'], [0.1, 0.95, 'nook']] },
  { id: 'ladderShelf', fam: 'shelf', w: [190, 250], ratio: [1.4, 1.8], layer: 2, base: 'floor',
    solid: [[0.05, 0.08, 0.9, 0.06], [0.05, 0.36, 0.9, 0.06], [0.05, 0.64, 0.9, 0.06], [0.05, 0.92, 0.9, 0.08]],
    slots: [[0.35, 0.02, 'shelf'], [0.68, 0.3, 'shelf'], [0.32, 0.58, 'shelf'], [0.7, 0.86, 'shelf']] },
  { id: 'wineRack', fam: 'shelf', w: [230, 300], ratio: [1.1, 1.45], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.22, 0.5, 'nook'], [0.78, 0.5, 'nook']] },
  { id: 'pantryShelf', fam: 'shelf', w: [280, 360], ratio: [1.0, 1.3], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.22, 0.16, 'shelf'], [0.56, 0.16, 'shelf'], [0.82, 0.16, 'shelf'], [0.35, 0.56, 'shelf'], [0.72, 0.56, 'shelf']] },
  { id: 'potShelf', fam: 'shelf', w: [240, 320], ratio: [1.1, 1.4], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.25, 0.14, 'shelf'], [0.7, 0.14, 'shelf'], [0.45, 0.52, 'shelf'], [0.5, 0.03, 'high']] },

  // ------------------------------------------------------------- tables
  { id: 'table', fam: 'table', w: [280, 380], ratio: [0.55, 0.75], layer: 2, base: 'floor',
    solid: [[0, 0, 1, 0.26], [0.06, 0.26, 0.1, 0.74], [0.84, 0.26, 0.1, 0.74]],
    slots: [[0.25, 0.08, 'table'], [0.55, 0.08, 'table'], [0.8, 0.08, 'table'], [0.45, 0.78, 'nook']] },
  { id: 'deskTall', fam: 'table', w: [300, 390], ratio: [0.6, 0.8], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.22, 0.1, 'table'], [0.52, 0.1, 'table'], [0.8, 0.1, 'table']] },
  { id: 'sideTable', fam: 'table', w: [150, 200], ratio: [0.9, 1.2], layer: 2, base: 'floor',
    solid: [[0, 0, 1, 0.2], [0.4, 0.2, 0.2, 0.8]], slots: [[0.35, 0.04, 'table'], [0.68, 0.04, 'table'], [0.5, 0.7, 'nook']] },
  { id: 'counter', fam: 'table', w: [340, 450], ratio: [0.5, 0.68], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.18, 0.08, 'table'], [0.45, 0.08, 'table'], [0.75, 0.08, 'table']] },
  { id: 'workbench', fam: 'table', w: [300, 400], ratio: [0.55, 0.75], layer: 2, base: 'floor',
    solid: [[0, 0, 1, 0.3], [0.04, 0.3, 0.12, 0.7], [0.84, 0.3, 0.12, 0.7]],
    slots: [[0.2, 0.08, 'table'], [0.55, 0.08, 'table'], [0.85, 0.08, 'table'], [0.5, 0.75, 'nook']] },
  { id: 'pottingBench', fam: 'table', w: [290, 370], ratio: [0.6, 0.8], layer: 2, base: 'floor',
    solid: [[0, 0, 1, 0.28], [0, 0.6, 1, 0.1], [0.05, 0.28, 0.1, 0.72], [0.85, 0.28, 0.1, 0.72]],
    slots: [[0.25, 0.06, 'table'], [0.62, 0.06, 'table'], [0.3, 0.48, 'nook'], [0.72, 0.48, 'nook']] },

  // ------------------------------------------------------------ seating
  { id: 'armchair', fam: 'seat', w: [230, 300], ratio: [0.85, 1.1], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.5, 0.3, 'nook'], [0.5, 0.03, 'high'], [0.08, 0.86, 'nook']] },
  { id: 'sofa', fam: 'seat', w: [360, 460], ratio: [0.5, 0.68], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.3, 0.24, 'nook'], [0.7, 0.24, 'nook'], [0.5, 0.03, 'high']] },
  { id: 'stool', fam: 'seat', w: [110, 150], ratio: [1.0, 1.35], layer: 4, base: 'floor',
    solid: [[0.05, 0, 0.9, 0.2], [0.35, 0.2, 0.3, 0.8]], slots: [[0.5, 0.02, 'table'], [0.5, 0.6, 'nook']] },
  { id: 'rockingChair', fam: 'seat', w: [200, 260], ratio: [1.1, 1.4], layer: 2, base: 'floor',
    solid: [[0.1, 0, 0.75, 0.9], [0, 0.9, 1, 0.1]], slots: [[0.45, 0.42, 'nook'], [0.9, 0.8, 'nook']] },
  { id: 'cushionPile', fam: 'soft', w: [160, 220], ratio: [0.5, 0.7], layer: 5, base: 'floor',
    solid: FULL, slots: [[0.1, 0.5, 'under'], [0.9, 0.5, 'under'], [0.5, 0.03, 'high']] },

  // ------------------------------------------------------------- chests
  { id: 'trunk', fam: 'chest', w: [230, 300], ratio: [0.55, 0.75], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.3, 0.03, 'high'], [0.7, 0.03, 'high'], [0.04, 0.6, 'nook']] },
  { id: 'crate', fam: 'chest', w: [150, 210], ratio: [0.8, 1.05], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.06, 0.55, 'nook']] },
  { id: 'crateFront', fam: 'front', w: [170, 240], ratio: [0.75, 1.0], layer: 5, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [-0.04, 0.45, 'behind'], [1.04, 0.45, 'behind']] },
  { id: 'barrel', fam: 'chest', w: [150, 200], ratio: [1.1, 1.4], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.03, 0.7, 'nook']] },
  { id: 'sack', fam: 'chest', w: [130, 180], ratio: [1.0, 1.3], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.95, 0.75, 'nook']] },
  { id: 'suitcase', fam: 'chest', w: [170, 230], ratio: [0.45, 0.62], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.35, 0.03, 'high'], [0.75, 0.03, 'high']] },
  { id: 'hatbox', fam: 'chest', w: [120, 160], ratio: [0.65, 0.85], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.04, 0.5, 'nook']] },

  // --------------------------------------------------------- tall things
  { id: 'clock', fam: 'tall', w: [150, 190], ratio: [2.4, 3.0], layer: 2, base: 'floor',
    solid: FULL, slots: [[-0.12, 0.8, 'nook'], [1.12, 0.8, 'nook'], [0.5, 0.03, 'high']] },
  { id: 'hatStand', fam: 'tall', w: [150, 190], ratio: [2.2, 2.8], layer: 2, base: 'floor',
    solid: [[0.42, 0, 0.16, 1]], slots: [[0.14, 0.1, 'hook'], [0.86, 0.14, 'hook'], [0.5, 0.95, 'nook']] },
  { id: 'ladder', fam: 'tall', w: [140, 190], ratio: [2.0, 2.7], layer: 2, base: 'floor',
    solid: [[0.06, 0, 0.12, 1], [0.82, 0, 0.12, 1], [0.1, 0.22, 0.8, 0.045], [0.1, 0.52, 0.8, 0.045], [0.1, 0.82, 0.8, 0.045]],
    slots: [[0.5, 0.17, 'shelf'], [0.5, 0.47, 'shelf'], [0.5, 0.77, 'shelf']] },
  { id: 'globeStand', fam: 'tall', w: [160, 210], ratio: [1.5, 1.9], layer: 2, base: 'floor',
    solid: [[0.05, 0, 0.9, 0.62], [0.4, 0.62, 0.2, 0.38]], slots: [[0.5, 0.03, 'high'], [0.06, 0.85, 'nook']] },
  { id: 'telescope', fam: 'tall', w: [250, 330], ratio: [1.2, 1.5], layer: 2, base: 'floor',
    solid: [[0.1, 0.05, 0.8, 0.3], [0.38, 0.35, 0.24, 0.65]], slots: [[0.14, 0.78, 'nook'], [0.86, 0.78, 'nook']] },
  { id: 'orrery', fam: 'tall', w: [220, 280], ratio: [1.1, 1.4], layer: 2, base: 'floor',
    solid: [[0.2, 0.1, 0.6, 0.45], [0.42, 0.55, 0.16, 0.45]], slots: [[0.1, 0.8, 'nook'], [0.9, 0.8, 'nook'], [0.5, 0.03, 'high']] },
  { id: 'gramophone', fam: 'tall', w: [190, 250], ratio: [1.2, 1.5], layer: 2, base: 'floor',
    solid: [[0.1, 0.02, 0.8, 0.5], [0.25, 0.52, 0.5, 0.48]], slots: [[0.08, 0.8, 'nook'], [0.9, 0.8, 'nook']] },
  { id: 'piano', fam: 'tall', w: [420, 520], ratio: [0.6, 0.78], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.2, 0.03, 'high'], [0.55, 0.03, 'high'], [0.84, 0.03, 'high'], [0.03, 0.6, 'nook']] },
  { id: 'harp', fam: 'tall', w: [190, 240], ratio: [1.7, 2.1], layer: 2, base: 'floor',
    solid: [[0.1, 0, 0.5, 1], [0.6, 0.05, 0.3, 0.3]], slots: [[0.82, 0.62, 'nook'], [0.5, 0.95, 'nook']] },
  { id: 'brokenMirror', fam: 'tall', w: [170, 220], ratio: [1.7, 2.2], layer: 2, base: 'floor',
    solid: FULL, slots: [[-0.1, 0.85, 'nook'], [1.1, 0.85, 'nook']] },
  { id: 'stove', fam: 'tall', w: [240, 300], ratio: [1.1, 1.4], layer: 2, base: 'floor',
    solid: FULL, slots: [[0.25, 0.03, 'high'], [0.7, 0.03, 'high'], [0.05, 0.75, 'nook']] },
  { id: 'dressForm', fam: 'tall', w: [140, 180], ratio: [1.9, 2.4], layer: 2, base: 'floor',
    solid: [[0.15, 0, 0.7, 0.62], [0.44, 0.62, 0.12, 0.38]], slots: [[0.5, 0.86, 'nook'], [0.07, 0.3, 'hook']] },

  // --------------------------------------------------------- floor plants
  { id: 'fern', fam: 'plant', w: [180, 250], ratio: [1.0, 1.35], layer: 4, base: 'floor',
    solid: [[0.2, 0.55, 0.6, 0.45]], slots: [[0.5, 0.3, 'nook'], [0.12, 0.85, 'nook'], [0.88, 0.85, 'nook']] },
  { id: 'potPlant', fam: 'plant', w: [150, 200], ratio: [1.1, 1.5], layer: 4, base: 'floor',
    solid: [[0.25, 0.5, 0.5, 0.5], [0.3, 0.1, 0.4, 0.4]], slots: [[0.5, 0.68, 'nook'], [0.9, 0.9, 'nook']] },
  { id: 'tallPalm', fam: 'plant', w: [210, 280], ratio: [1.5, 2.0], layer: 4, base: 'floor',
    solid: [[0.32, 0.62, 0.36, 0.38]], slots: [[0.5, 0.5, 'nook'], [0.1, 0.9, 'nook']] },
  { id: 'vineBox', fam: 'plant', w: [220, 300], ratio: [0.6, 0.85], layer: 5, base: 'floor',
    solid: FULL, slots: [[0.04, 0.4, 'behind'], [0.96, 0.4, 'behind'], [0.5, 0.03, 'high']] },
  { id: 'mushrooms', fam: 'plant', w: [130, 180], ratio: [0.6, 0.85], layer: 4, base: 'floor',
    solid: [[0.1, 0.3, 0.8, 0.7]], slots: [[0.5, 0.03, 'high'], [0.95, 0.6, 'nook']] },

  // ------------------------------------------------------- small clutter
  { id: 'bookStack', fam: 'clutter', w: [120, 170], ratio: [0.55, 0.8], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.04, 0.5, 'nook']] },
  { id: 'bucket', fam: 'clutter', w: [110, 150], ratio: [0.9, 1.15], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.95, 0.65, 'nook']] },
  { id: 'wateringCan', fam: 'clutter', w: [130, 170], ratio: [0.8, 1.05], layer: 4, base: 'floor',
    solid: [[0.1, 0.1, 0.75, 0.9]], slots: [[0.5, 0.03, 'high'], [0.95, 0.6, 'nook']] },
  { id: 'bottles', fam: 'clutter', w: [120, 170], ratio: [0.9, 1.2], layer: 4, base: 'floor',
    solid: [[0.08, 0.08, 0.84, 0.92]], slots: [[0.5, 0.95, 'nook'], [0.02, 0.7, 'nook']] },
  { id: 'pots', fam: 'clutter', w: [140, 190], ratio: [0.6, 0.85], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.96, 0.6, 'nook']] },
  { id: 'cheeseWheel', fam: 'clutter', w: [120, 160], ratio: [0.7, 0.95], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.03, 0.6, 'nook']] },
  { id: 'toyBlocks', fam: 'clutter', w: [130, 180], ratio: [0.5, 0.72], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.95, 0.5, 'nook']] },
  { id: 'rolledRugs', fam: 'clutter', w: [120, 160], ratio: [0.8, 1.0], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.05, 0.55, 'nook']] },
  { id: 'dustpan', fam: 'clutter', w: [120, 160], ratio: [0.6, 0.85], layer: 4, base: 'floor',
    solid: [[0.15, 0.2, 0.8, 0.8]], slots: [[0.5, 0.03, 'high']] },
  { id: 'logPile', fam: 'clutter', w: [160, 220], ratio: [0.5, 0.7], layer: 4, base: 'floor',
    solid: FULL, slots: [[0.5, 0.03, 'high'], [0.03, 0.5, 'nook']] },

  // -------------------------------------------------------- wall mounted
  { id: 'portrait', fam: 'wall', w: [150, 220], ratio: [1.1, 1.4], layer: 1, base: 'wall',
    solid: FULL, slots: [[-0.02, 0.58, 'behind'], [1.02, 0.58, 'behind']] },
  { id: 'wallShelf', fam: 'wall', w: [200, 280], ratio: [0.28, 0.4], layer: 1, base: 'wall',
    solid: FULL, slots: [[0.2, 0.08, 'shelf'], [0.5, 0.08, 'shelf'], [0.8, 0.08, 'shelf']] },
  { id: 'pegRail', fam: 'wall', w: [220, 300], ratio: [0.16, 0.26], layer: 1, base: 'wall',
    solid: FULL, slots: [[0.18, 0.9, 'hook'], [0.5, 0.9, 'hook'], [0.82, 0.9, 'hook']] },
  { id: 'wallClock', fam: 'wall', w: [120, 160], ratio: [0.95, 1.1], layer: 1, base: 'wall',
    solid: FULL, slots: [[-0.02, 0.58, 'behind'], [1.02, 0.58, 'behind']] },
  { id: 'mapFrame', fam: 'wall', w: [200, 280], ratio: [0.7, 0.95], layer: 1, base: 'wall',
    solid: FULL, slots: [[-0.02, 0.58, 'behind'], [1.02, 0.58, 'behind']] },
  { id: 'mirrorOval', fam: 'wall', w: [140, 190], ratio: [1.2, 1.5], layer: 1, base: 'wall',
    solid: FULL, slots: [[-0.02, 0.58, 'behind'], [1.02, 0.58, 'behind']] },
  { id: 'sconce', fam: 'wall', w: [90, 120], ratio: [1.1, 1.4], layer: 1, base: 'wall',
    solid: [[0.25, 0.2, 0.5, 0.8]], slots: [[0.5, 1.02, 'hook']] },
  { id: 'copperPans', fam: 'wall', w: [200, 270], ratio: [0.55, 0.75], layer: 1, base: 'wall',
    solid: FULL, slots: [[-0.02, 0.58, 'behind'], [1.02, 0.58, 'behind']] },
  { id: 'herbBundle', fam: 'wall', w: [110, 150], ratio: [1.1, 1.5], layer: 1, base: 'wall',
    solid: [[0.2, 0, 0.6, 0.9]], slots: [[0.5, 0.95, 'hook']] },
  { id: 'starChart', fam: 'wall', w: [210, 290], ratio: [0.75, 1.0], layer: 1, base: 'wall',
    solid: FULL, slots: [[-0.02, 0.58, 'behind'], [1.02, 0.58, 'behind']] },

  // ------------------------------------------------------------- hanging
  { id: 'chandelier', fam: 'hang', w: [200, 260], ratio: [0.8, 1.05], layer: 1, base: 'ceiling',
    solid: [[0.1, 0.3, 0.8, 0.7]], slots: [[0.5, 1.08, 'hook']] },
  { id: 'lanternHang', fam: 'hang', w: [110, 150], ratio: [1.2, 1.6], layer: 1, base: 'ceiling',
    solid: [[0.2, 0.35, 0.6, 0.65]], slots: [[0.5, 1.1, 'hook']] },
  { id: 'birdcage', fam: 'hang', w: [120, 160], ratio: [1.3, 1.7], layer: 1, base: 'ceiling',
    solid: [[0.15, 0.3, 0.7, 0.65]], slots: [[0.5, 1.05, 'hook'], [0.5, 0.6, 'nook']] },
  { id: 'bunting', fam: 'hang', w: [300, 420], ratio: [0.22, 0.35], layer: 1, base: 'ceiling',
    solid: [], slots: [[0.3, 1.3, 'hook'], [0.7, 1.3, 'hook']] },

  // ------------------------------------------------- front layer and soft
  { id: 'rug', fam: 'rug', w: [360, 480], ratio: [0.3, 0.42], layer: 3, base: 'floor',
    solid: FULL, slots: [[0.06, 0.3, 'under'], [0.94, 0.3, 'under'], [0.5, -0.1, 'under']] },
  { id: 'rugRound', fam: 'rug', w: [300, 400], ratio: [0.42, 0.55], layer: 3, base: 'floor',
    solid: [[0.04, 0.1, 0.92, 0.9]], slots: [[0.08, 0.35, 'under'], [0.92, 0.35, 'under']] },
  { id: 'curtain', fam: 'curtain', w: [170, 230], ratio: [3.0, 3.8], layer: 5, base: 'ceiling',
    solid: FULL, slots: [[-0.02, 0.86, 'behind'], [1.02, 0.86, 'behind'], [-0.02, 0.5, 'behind'], [1.02, 0.5, 'behind']] },
  { id: 'tablecloth', fam: 'front', w: [210, 275], ratio: [0.5, 0.7], layer: 5, base: 'floor',
    solid: FULL, slots: [[0.02, 0.6, 'behind'], [0.98, 0.6, 'behind'], [0.5, 0.06, 'table']] },
  { id: 'screenFold', fam: 'front', w: [250, 330], ratio: [1.4, 1.8], layer: 5, base: 'floor',
    solid: FULL, slots: [[-0.03, 0.75, 'behind'], [1.03, 0.75, 'behind']] },

  // ------------------------------------------------------- frame / decor
  { id: 'cobweb', fam: 'frame', w: [160, 240], ratio: [0.8, 1.0], layer: 6, base: 'free',
    solid: [], slots: [] },
  { id: 'dustMote', fam: 'frame', w: [60, 110], ratio: [0.9, 1.1], layer: 6, base: 'free',
    solid: [], slots: [] },
];

export const PROPS = Object.fromEntries(defs.map((p) => [p.id, p]));
export const PROP_LIST = defs;

export function family(fam) {
  return defs.filter((p) => p.fam === fam);
}

export const FAMILIES = [...new Set(defs.map((p) => p.fam))].sort();

// Absolute cover rects for a placed prop box, in world coordinates.
export function coverRects(def, box) {
  return (def.solid || []).map(([x, y, w, h]) => ({
    x: box.x + x * box.w,
    y: box.y + y * box.h,
    w: w * box.w,
    h: h * box.h,
  }));
}

// Where a prop's hide slots land in world coordinates.
export function slotPoints(def, box) {
  return (def.slots || []).map(([fx, fy, kind]) => ({
    x: box.x + fx * box.w,
    y: box.y + fy * box.h,
    kind,
  }));
}
