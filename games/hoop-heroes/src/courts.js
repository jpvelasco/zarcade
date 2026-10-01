// Court themes: gravity, names and the colours the renderer paints with.
export const COURTS = [
  {
    id: 'park', far: '#7cc96a', name: 'Sunny Park', g: 9.8, blurb: 'Blacktop, big trees and a chain-link fence.',
    sky: ['#5cc8ff', '#a8e6ff', '#e8fbff'], ground: '#5fbf4a', ground2: '#4aa83c',
    floor: '#3f4a5c', floor2: '#4a566b', paint: '#e2554a', line: '#ffffff', accent: '#ffcf3a',
    board: '#ffffff', boardEdge: '#e2554a', pole: '#2f6fd6', scenery: 'park',
  },
  {
    id: 'beach', far: '#2a8fbf', name: 'Boardwalk Beach', g: 9.8, blurb: 'Sand, surf and palm trees at golden hour.',
    sky: ['#ff9a6b', '#ffc98a', '#fff0c2'], ground: '#f4d58d', ground2: '#ecc673',
    floor: '#2aa6b8', floor2: '#34b6c7', paint: '#ffb03a', line: '#fffbe8', accent: '#ff6f91',
    board: '#fffdf2', boardEdge: '#ff6f91', pole: '#ff8a3d', scenery: 'beach',
  },
  {
    id: 'roof', far: '#1c1240', name: 'City Rooftop', g: 9.8, blurb: 'Neon signs and skyscrapers after dark.',
    sky: ['#170b3b', '#3a1d6e', '#ff6fae'], ground: '#2c2f45', ground2: '#262839',
    floor: '#5d3fd3', floor2: '#6a4ce0', paint: '#18d6c9', line: '#f5f0ff', accent: '#ffe14d',
    board: '#eafcff', boardEdge: '#18d6c9', pole: '#ff4fa3', scenery: 'roof',
  },
  {
    id: 'space', far: '#14102e', name: 'Space Station', g: 4.0, blurb: 'Low gravity! Floaty shots under a giant planet.',
    sky: ['#05031a', '#140b3d', '#2d1a6b'], ground: '#2a3150', ground2: '#232a45',
    floor: '#3b4570', floor2: '#46517f', paint: '#7cf0ff', line: '#d9f7ff', accent: '#b98bff',
    board: '#e9f6ff', boardEdge: '#7cf0ff', pole: '#9aa6c8', scenery: 'space',
  },
  {
    id: 'neon', far: '#0c0830', name: 'Neon Night', g: 9.8, blurb: 'Glowing lines in a midnight arcade.',
    sky: ['#03020d', '#0c0830', '#1d0f4f'], ground: '#0b0a1f', ground2: '#0e0d26',
    floor: '#120f33', floor2: '#17133f', paint: '#ff3fd0', line: '#4ff3ff', accent: '#4ff3ff',
    board: '#18143e', boardEdge: '#ff3fd0', pole: '#4ff3ff', scenery: 'neon',
  },
  {
    id: 'candy', far: '#9ee6c3', name: 'Candy Court', g: 9.8, blurb: 'Gumdrop hills and a strawberry-milk sky.',
    sky: ['#ffa6d2', '#ffd1e8', '#fff2fa'], ground: '#9ee6c3', ground2: '#8ad9b3',
    floor: '#ffc27a', floor2: '#ffcf93', paint: '#ff6fb5', line: '#fffaff', accent: '#8a6cff',
    board: '#ffffff', boardEdge: '#ff6fb5', pole: '#8a6cff', scenery: 'candy',
  },
];

export const COURT_BY_ID = Object.fromEntries(COURTS.map((c) => [c.id, c]));
