// PWA installability: the manifest, the icons it names, the head links that
// make a phone offer to install, and the offline shell the service worker
// keeps. Everything must stay relative so the site works under any
// deployment path (it ships at the GitHub Pages sub-path /zarcade/).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..', '..');

// Decodes the unfiltered RGBA PNGs that scripts/gen-icons.mjs writes.
function pngPixels(file) {
  const b = fs.readFileSync(file);
  const { width, height } = pngSize(file);
  const idat = [];
  for (let at = 8; at < b.length;) {
    const len = b.readUInt32BE(at);
    if (b.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(b.subarray(at + 8, at + 8 + len));
    at += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  for (let y = 0; y < height; y++) assert.equal(raw[y * stride], 0, `${file} rows are unfiltered`);
  const at = (x, y) => [...raw.subarray(y * stride + 1 + x * 4, y * stride + 4 + x * 4)];
  return { width, height, at };
}

// The mark's bounding box: pixels that differ from their row's background
// (the gradient is vertical, so x = 0 is always background).
function markBox(file) {
  const { width, height, at } = pngPixels(file);
  const box = { left: width, right: 0, top: height, bottom: 0, reach: 0 };
  for (let y = 0; y < height; y++) {
    const bg = at(0, y);
    for (let x = 0; x < width; x++) {
      if (at(x, y).reduce((d, c, i) => d + Math.abs(c - bg[i]), 0) <= 30) continue;
      Object.assign(box, { left: Math.min(box.left, x), right: Math.max(box.right, x), top: Math.min(box.top, y), bottom: Math.max(box.bottom, y) });
      box.reach = Math.max(box.reach, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2) / (width / 2));
    }
  }
  return { ...box, cx: (box.left + box.right) / 2, cy: (box.top + box.bottom) / 2 };
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), size: b.length };
}

test('manifest.json is a valid, relative, installable manifest', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.name, 'Starlight Arcade');
  assert.equal(m.short_name, 'Zarcade');
  assert.ok(m.description.length >= 20, 'description is real copy');
  assert.equal(m.id, './');
  assert.equal(m.start_url, './', 'start_url is relative so the Pages sub-path works');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(!raw.includes('http'), 'no absolute URLs: the manifest must work under any path');
});

test('manifest icons exist at the sizes declared, with any + maskable purposes', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const purposes = new Map();
  for (const icon of m.icons) {
    const [w, h] = icon.sizes.split('x').map(Number);
    const file = path.join(ROOT, icon.src);
    const png = pngSize(file);
    assert.deepEqual([png.width, png.height], [w, h], `${icon.src} matches its declared size`);
    assert.ok(png.size > 1000, `${icon.src} is not a trivially empty file`);
    purposes.set(icon.purpose, [...(purposes.get(icon.purpose) || []), `${w}x${h}`]);
  }
  assert.deepEqual(purposes.get('any').sort(), ['192x192', '512x512'], 'any covers 192 and 512');
  assert.deepEqual(purposes.get('maskable'), ['512x512'], 'maskable is a 512 file of its own');
});

test('the maskable icon keeps its mark centred inside the 80% safe zone', () => {
  const plain = markBox(path.join(ROOT, 'icons', 'icon-512.png'));
  const mask = markBox(path.join(ROOT, 'icons', 'icon-512-maskable.png'));
  for (const [name, box] of [['icon-512', plain], ['icon-512-maskable', mask]]) {
    assert.ok(Math.abs(box.cx - 256) <= 4 && Math.abs(box.cy - 256) <= 4, `${name} mark is centred, not at (${box.cx}, ${box.cy})`);
  }
  assert.ok(mask.reach <= 0.8 * 0.8 + 0.02, `the maskable mark is the plain mark shrunk to 80% (reaches ${mask.reach.toFixed(2)} of the radius)`);
});

test('the apple-touch-icon is a 180×180 square', () => {
  const png = pngSize(path.join(ROOT, 'icons', 'apple-touch-icon.png'));
  assert.deepEqual([png.width, png.height], [180, 180], 'iOS sizes it down from 180');
});

test('index.html offers the install: manifest link, apple metas, touch icon', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.json">/, 'relative manifest link');
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/, 'iOS can install it');
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/, 'full-bleed standalone look');
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Starlight Arcade">/, 'iOS homescreen title');
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/, 'touch icon');
  assert.match(html, /<meta name="viewport"[^>]*viewport-fit=cover/, 'the viewport reaches the safe areas');
  assert.match(html, /<meta name="theme-color"/, 'the address bar matches the arcade night');
});

test('the arcade page wires up the install button, the iOS hint, and the worker', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'arcade', 'arcade.js'), 'utf8');
  for (const id of ['btn-install', 'install-hint', 'install-hint-close']) assert.ok(html.includes(`id="${id}"`), `#${id} is in the page`);
  assert.ok(js.includes("beforeinstallprompt"), 'the custom prompt is captured');
  assert.ok(js.includes("'appinstalled'"), 'installing from the browser menu hides the button and hint too');
  assert.ok(js.includes('installMode'), 'the affordance choice goes through the testable helper');
  assert.ok(js.includes('serviceWorker.register'), 'the offline shell registers on http(s)');
});

test('sw.js keeps the shell offline without caching the whole catalogue', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /addEventListener\('install'/);
  assert.match(sw, /addEventListener\('activate'/);
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /games\/|ALL games|whole catalogue|SHELL_URLS/, 'precaching is scoped to the shell');
  assert.ok(!sw.includes('http://') && !sw.includes('https://'), 'the worker only touches its own origin');
});
