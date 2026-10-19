// A small least-recently-used cache. The renderer keeps baked block sprites
// and scenery layouts in these so memory stays bounded however far the bike
// rides. DOM-free so Node tests can exercise it.

export class LruCache {
  constructor(limit = 64, onEvict = null) {
    this.limit = Math.max(1, limit | 0);
    this.onEvict = onEvict;
    this.map = new Map();
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    return this.map.has(key);
  }

  // Reading an entry marks it as the most recently used.
  get(key) {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  // Reads without touching recency, for checks that should not keep an
  // entry alive.
  peek(key) {
    return this.map.get(key);
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    this.trim();
    return value;
  }

  delete(key) {
    const value = this.map.get(key);
    if (value === undefined) return false;
    this.map.delete(key);
    this.onEvict?.(key, value);
    return true;
  }

  setLimit(limit) {
    this.limit = Math.max(1, limit | 0);
    this.trim();
  }

  trim() {
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      const value = this.map.get(oldest);
      this.map.delete(oldest);
      this.onEvict?.(oldest, value);
    }
  }

  clear() {
    if (this.onEvict) for (const [key, value] of this.map) this.onEvict(key, value);
    this.map.clear();
  }
}
