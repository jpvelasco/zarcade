// Main-thread client for the AI worker. One request at a time; cancel()
// terminates a long think (undo, new game) and starts a fresh worker.
// If workers are unavailable, it falls back to thinking on the main thread
// with a small budget.
import { createThinker } from './think.js';

export class Brain {
  constructor({ onError } = {}) {
    this.onError = onError || (() => {});
    this.nextId = 1;
    this.pending = null;
    this.fallback = null;
    this.spawn();
  }

  spawn() {
    try {
      this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.receive(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault?.();
        this.onError('worker.error', e.message || 'worker failed');
        this.worker = null;
        const p = this.pending;
        if (p) { this.pending = null; this.runFallback(p.req, p.resolve); }
      };
    } catch (err) {
      this.onError('worker.unavailable', String(err));
      this.worker = null;
    }
  }

  receive(data) {
    const p = this.pending;
    if (!p || data.id !== p.id) return;
    this.pending = null;
    if (data.error) { this.onError('worker.think', data.error); this.runFallback(p.req, p.resolve); return; }
    p.resolve(data);
  }

  runFallback(req, resolve) {
    if (!this.fallback) this.fallback = createThinker();
    // Keep the main thread responsive: weak, quick settings only.
    setTimeout(() => {
      try { resolve(this.fallback({ ...req, level: Math.min(req.level ?? 0, 2), timeMs: 150, maxDepth: 4, coach: false })); }
      catch (err) { this.onError('fallback.think', String(err)); resolve({ id: req.id, move: null }); }
    }, 0);
  }

  get busy() { return !!this.pending; }

  ask(req) {
    this.cancel();
    const id = this.nextId++;
    const full = { ...req, id };
    return new Promise((resolve) => {
      this.pending = { id, req: full, resolve };
      if (this.worker) this.worker.postMessage(full);
      else this.runFallback(full, (r) => { if (this.pending && this.pending.id === id) { this.pending = null; resolve(r); } });
    });
  }

  // Drop the current request. Its promise never resolves.
  cancel() {
    if (!this.pending) return;
    this.pending = null;
    if (this.worker) {
      this.worker.terminate();
      this.spawn();
    }
  }
}
