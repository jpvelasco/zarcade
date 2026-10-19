// Keyboard and gamepad focus across the things you can act on: playable
// cards and the stock. Pure: items are { key, x, y } centres on screen.
//   next / prev   Tab order: cards left to right, then the stock, wrapping;
//   left / right  nearest item that way, else wrap to the far side;
//   up / down     nearest item that way, else stay.

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export function tabOrder(items) {
  const last = (it) => (it.key === 'stock' ? 1 : 0);
  return items.slice().sort((a, b) => last(a) - last(b) || a.x - b.x || a.y - b.y);
}

export function stepFocus(items, current, dir) {
  if (!items.length) return null;
  const order = tabOrder(items);
  const cur = items.find((it) => it.key === current);
  if (!cur) return order[0].key;
  if (dir === 'next' || dir === 'prev') {
    const i = order.indexOf(cur);
    return order[(i + (dir === 'next' ? 1 : -1) + order.length) % order.length].key;
  }
  const v = DIRS[dir];
  if (!v) return current;
  let best = null;
  let bestScore = Infinity;
  for (const it of items) {
    if (it === cur) continue;
    const dx = it.x - cur.x;
    const dy = it.y - cur.y;
    const along = dx * v[0] + dy * v[1];
    if (along <= 1) continue;
    const across = Math.abs(dx * v[1]) + Math.abs(dy * v[0]);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  if (best) return best.key;
  // Nothing that way: left and right wrap around to the far side.
  if (dir === 'left' || dir === 'right') {
    const byX = items.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    return (dir === 'right' ? byX[0] : byX[byX.length - 1]).key;
  }
  return current;
}

// After a move the focused card may be gone: keep focus near where it was.
export function nearestKey(items, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = (it.x - x) ** 2 + (it.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = it.key;
    }
  }
  return best;
}
