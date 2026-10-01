// Little cartoon bugs for the Bug Zapper jar, drawn with Canvas paths.
// Missing bugs are drawn as silhouettes.

export function drawBug(g, cx, cy, s, look, { silhouette = false, t = 0 } = {}) {
  const body = silhouette ? '#2a3046' : look.body;
  const spots = silhouette ? '#2a3046' : look.spots;
  const ink = silhouette ? '#2a3046' : '#2a2030';
  const eye = silhouette ? '#2a3046' : '#ffffff';
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const wob = Math.sin(t * 3) * 0.04;
  const legs = (n, len, y0 = 0, spread = 0.5) => {
    g.strokeStyle = ink;
    g.lineWidth = s * 0.035;
    for (let i = 0; i < n; i++) {
      const y = y0 + (i - (n - 1) / 2) * s * 0.12;
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(k * s * 0.12, y);
        g.lineTo(k * s * (0.12 + len), y + s * spread * 0.2);
        g.stroke();
      }
    }
  };
  const antennae = (y, len = 0.18) => {
    g.strokeStyle = ink;
    g.lineWidth = s * 0.03;
    for (const k of [-1, 1]) {
      g.beginPath();
      g.moveTo(k * s * 0.05, y);
      g.quadraticCurveTo(k * s * 0.12, y - s * len, k * s * (0.16 + wob), y - s * len * 1.1);
      g.stroke();
      g.fillStyle = spots;
      g.beginPath();
      g.arc(k * s * (0.16 + wob), y - s * len * 1.1, s * 0.03, 0, Math.PI * 2);
      g.fill();
    }
  };
  const face = (y, r = 0.13) => {
    g.fillStyle = silhouette ? body : '#3a2e44';
    g.beginPath();
    g.arc(0, y, s * r, 0, Math.PI * 2);
    g.fill();
    if (silhouette) return;
    for (const k of [-1, 1]) {
      g.fillStyle = eye;
      g.beginPath();
      g.arc(k * s * r * 0.42, y - s * 0.01, s * r * 0.32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1424';
      g.beginPath();
      g.arc(k * s * r * 0.42, y, s * r * 0.15, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#ffb0c0';
    g.lineWidth = s * 0.02;
    g.beginPath();
    g.arc(0, y + s * r * 0.35, s * r * 0.25, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  };
  const wing = (k, w, h, rot, col, alpha = 0.8) => {
    g.save();
    g.rotate(k * rot);
    g.globalAlpha = silhouette ? 1 : alpha;
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(k * s * w * 0.6, -s * 0.02, s * w, s * h, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.restore();
  };
  switch (look.shape) {
    case 'beetle':
    case 'weevil': {
      legs(3, 0.2, s * 0.08);
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, s * 0.08, s * 0.26, s * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = ink;
      g.lineWidth = s * 0.025;
      g.beginPath();
      g.moveTo(0, -s * 0.18);
      g.lineTo(0, s * 0.37);
      g.stroke();
      g.fillStyle = spots;
      for (const [x, y, r] of [[-0.12, 0, 0.05], [0.12, 0, 0.05], [-0.1, 0.18, 0.045], [0.1, 0.18, 0.045]]) {
        g.beginPath();
        g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
        g.fill();
      }
      if (look.shape === 'weevil') {
        g.strokeStyle = ink;
        g.lineWidth = s * 0.05;
        g.beginPath();
        g.moveTo(0, -s * 0.3);
        g.lineTo(0, -s * 0.44);
        g.stroke();
      }
      face(-s * 0.24);
      antennae(-s * 0.33);
      break;
    }
    case 'moth':
    case 'dragonfly':
    case 'firefly': {
      const flap = 0.15 + Math.sin(t * 8) * 0.1;
      const wc = look.shape === 'moth' ? body : '#d8f6ff';
      wing(-1, 0.24, 0.15, 0.5 + flap, wc, look.shape === 'moth' ? 1 : 0.7);
      wing(1, 0.24, 0.15, 0.5 + flap, wc, look.shape === 'moth' ? 1 : 0.7);
      if (look.shape !== 'firefly') {
        wing(-1, 0.2, 0.12, -0.35 - flap, look.shape === 'moth' ? spots : '#d8f6ff', 0.7);
        wing(1, 0.2, 0.12, -0.35 - flap, look.shape === 'moth' ? spots : '#d8f6ff', 0.7);
      }
      g.fillStyle = look.shape === 'moth' ? spots : body;
      g.beginPath();
      const long = look.shape === 'dragonfly' ? 0.4 : 0.22;
      g.ellipse(0, s * 0.1, s * 0.08, s * long, 0, 0, Math.PI * 2);
      g.fill();
      if (look.shape === 'firefly' && !silhouette) {
        g.fillStyle = '#fff6a0';
        g.globalAlpha = 0.6 + Math.sin(t * 4) * 0.3;
        g.beginPath();
        g.arc(0, s * 0.24, s * 0.12, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      face(-s * 0.16, 0.11);
      antennae(-s * 0.24, 0.16);
      break;
    }
    case 'ant':
    case 'bee': {
      legs(3, 0.18, s * 0.05);
      if (look.shape === 'bee') {
        wing(-1, 0.14, 0.1, 0.9 + Math.sin(t * 12) * 0.2, '#e8f8ff', 0.75);
        wing(1, 0.14, 0.1, 0.9 + Math.sin(t * 12) * 0.2, '#e8f8ff', 0.75);
      }
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, s * 0.2, s * 0.18, s * 0.17, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(0, -s * 0.02, s * 0.11, s * 0.09, 0, 0, Math.PI * 2);
      g.fill();
      if (look.shape === 'bee') {
        g.fillStyle = spots;
        g.fillRect(-s * 0.17, s * 0.14, s * 0.34, s * 0.05);
        g.fillRect(-s * 0.15, s * 0.25, s * 0.3, s * 0.05);
      }
      face(-s * 0.19, 0.12);
      antennae(-s * 0.28);
      break;
    }
    case 'snail': {
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, s * 0.28, s * 0.36, s * 0.08, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = spots;
      g.beginPath();
      g.arc(s * 0.04, s * 0.06, s * 0.22, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = silhouette ? spots : body;
      g.lineWidth = s * 0.04;
      g.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.2) {
        const r = s * 0.02 + a * s * 0.014;
        const x = s * 0.04 + Math.cos(a) * r;
        const y = s * 0.06 + Math.sin(a) * r;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.save();
      g.translate(-s * 0.26, s * 0.08);
      face(0, 0.09);
      g.restore();
      g.strokeStyle = ink;
      g.lineWidth = s * 0.025;
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(-s * 0.26 + k * s * 0.03, 0);
        g.lineTo(-s * 0.3 + k * s * 0.06, -s * 0.12);
        g.stroke();
      }
      break;
    }
    case 'cricket':
    case 'mantis':
    case 'stick': {
      g.strokeStyle = ink;
      g.lineWidth = s * 0.035;
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(k * s * 0.08, s * 0.12);
        g.lineTo(k * s * 0.3, -s * 0.02);
        g.lineTo(k * s * 0.34, s * 0.32);
        g.stroke();
      }
      legs(2, 0.16, s * 0.0);
      g.fillStyle = body;
      g.beginPath();
      const len = look.shape === 'stick' ? 0.42 : 0.28;
      g.ellipse(0, s * 0.12, s * (look.shape === 'stick' ? 0.06 : 0.13), s * len, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = spots;
      g.beginPath();
      g.ellipse(0, s * 0.18, s * (look.shape === 'stick' ? 0.03 : 0.07), s * len * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      if (look.shape === 'mantis') {
        g.strokeStyle = body;
        g.lineWidth = s * 0.05;
        for (const k of [-1, 1]) {
          g.beginPath();
          g.moveTo(k * s * 0.06, -s * 0.12);
          g.lineTo(k * s * 0.18, -s * 0.04);
          g.lineTo(k * s * 0.12, -s * 0.22);
          g.stroke();
        }
      }
      face(-s * 0.2, 0.11);
      antennae(-s * 0.28, 0.22);
      break;
    }
    case 'pill': {
      legs(4, 0.12, s * 0.12, 0.2);
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, s * 0.1, s * 0.27, s * 0.24, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = spots;
      g.lineWidth = s * 0.03;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.ellipse(0, s * 0.1 + i * s * 0.07, s * 0.26 - Math.abs(i) * s * 0.04, s * 0.02, 0, 0, Math.PI);
        g.stroke();
      }
      face(-s * 0.16, 0.12);
      antennae(-s * 0.25);
      break;
    }
    case 'worm':
    default: {
      g.fillStyle = body;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(-s * 0.22 + i * s * 0.11, s * 0.16 + Math.sin(t * 4 + i) * s * 0.03, s * 0.09, 0, Math.PI * 2);
        g.fill();
      }
      if (!silhouette) {
        g.fillStyle = 'rgba(255,240,150,0.5)';
        g.beginPath();
        g.arc(-s * 0.22, s * 0.16, s * 0.14, 0, Math.PI * 2);
        g.fill();
      }
      g.save();
      g.translate(s * 0.24, s * 0.04);
      face(0, 0.11);
      antennae(-s * 0.08, 0.12);
      g.restore();
      break;
    }
  }
  g.restore();
}
