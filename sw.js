// Starlight Arcade service worker. The arcade shell (index page, manifest,
// icons, arcade CSS/JS) is cached for offline play and instant relaunch;
// everything else is served network-first so new games ship without a
// service-worker update. A failed fetch for the shell falls back to the
// cached copy and shows a small "offline" notice. Paths stay relative to
// this file's scope, so the worker works from any deployment sub-path.
const SHELL_CACHE = 'zarcade-shell-v1';
const SHELL_PATHS = ['./', './index.html', './manifest.json', './arcade/arcade.css', './arcade/arcade.js', './arcade/logic.js', './arcade/games.js', './arcade/telemetry.js', './arcade/fullscreen.js', './arcade/carpet.svg', './arcade/favicon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const SHELL_URLS = SHELL_PATHS.map((p) => new URL(p, self.location).href);
const INDEX_URL = new URL('./index.html', self.location).href;
const OFFLINE_NOTE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title><p style="font-family:system-ui;color:#fff4e6;background:#0b0620;margin:0;padding:3rem;text-align:center">This game needs a connection on first play. Check your network and try again.</p>';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('zarcade-') && n !== SHELL_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Strip the query (?sw=1 and the like must not defeat the shell cache).
  const bare = request.url.replace(/[?#].*$/, '');
  event.respondWith(SHELL_URLS.includes(bare) ? shellFirst(request) : networkFirst(request));
});

// Shell: try the network (so edits ship), fall back to the cache offline.
async function shellFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (_) { /* offline: use the cache below */ }
  const cached = (await caches.match(request, { ignoreSearch: true })) || (await caches.match(INDEX_URL));
  if (cached) return cached;
  return new Response(OFFLINE_NOTE, { status: 503, statusText: 'offline', headers: { 'Content-Type': 'text/html' } });
}

// Games and assets: network-first, and any successful fetch joins the cache
// so a played game boots from the cache on the next visit. Very large
// responses are served once and left uncached so the cache stays small.
const CACHE_LIMIT = 5 * 1024 * 1024;
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && (Number(response.headers.get('content-length')) || 0) < CACHE_LIMIT) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return new Response(OFFLINE_NOTE, { status: 503, statusText: 'offline', headers: { 'Content-Type': 'text/html' } });
  }
}
