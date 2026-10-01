const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../telemetry.js');
const { GAMES } = require('../games.js');

const ROOT = path.join(__dirname, '..', '..');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function logger(extra = {}) {
  let clock = 1_700_000_000_000;
  return T.create({ service: 'demo', storage: memoryStorage(), now: () => clock++, random: seeded(), ...extra });
}

test('records follow the OpenTelemetry log shape and persist per game', () => {
  const storage = memoryStorage();
  const log = T.create({ service: 'demo', storage, now: () => 1000, random: seeded() });
  log.event('level.start', { level: 3, mode: 'story', skipped: undefined });
  const [record] = log.records();
  assert.equal(record.severity, 'INFO');
  assert.equal(record.body, 'level.start');
  assert.deepEqual(record.attributes, { 'event.name': 'level.start', level: 3, mode: 'story' });
  assert.match(record.traceId, /^[0-9a-f]{32}$/);
  assert.match(record.spanId, /^[0-9a-f]{16}$/);
  assert.equal(JSON.parse(storage.data[T.logKey('demo')]).length, 1);
  // A later session reads the earlier records back.
  const next = T.create({ service: 'demo', storage, random: seeded(9) });
  assert.equal(next.records().length, 1);
  assert.notEqual(next.sessionId, log.sessionId);
});

test('exceptions use the semantic convention attributes', () => {
  const log = logger();
  const error = new TypeError('boom');
  const record = log.exception(error, { fatal: true, 'error.source': 'frame' });
  assert.equal(record.severity, 'FATAL');
  assert.equal(record.attributes['exception.type'], 'TypeError');
  assert.equal(record.attributes['exception.message'], 'boom');
  assert.match(record.attributes['exception.stacktrace'], /boom/);
  assert.equal(record.attributes['exception.escaped'], true);
  assert.equal(record.attributes['error.source'], 'frame');
  assert.equal(log.recentErrors().length, 1);
  assert.equal(T.exceptionAttributes('plain text')['exception.message'], 'plain text');
});

test('the ring buffer keeps the newest records only', () => {
  const log = logger();
  for (let i = 0; i < T.MAX_RECORDS + 25; i++) log.info(`line ${i}`);
  const records = log.records();
  assert.equal(records.length, T.MAX_RECORDS);
  assert.equal(records.at(-1).body, `line ${T.MAX_RECORDS + 24}`);
});

test('OTLP export builds a valid logs request and only runs with an endpoint', async () => {
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const quiet = logger({ fetch });
  quiet.info('hello');
  assert.equal(await quiet.flush(), false, 'no endpoint, nothing sent');
  assert.equal(sent.length, 0);

  const log = logger({ fetch, endpoint: 'http://localhost:4318' });
  log.info('hello', { level: 2, ratio: 0.5, ok: true });
  assert.equal(await log.flush(), true);
  assert.equal(sent[0].url, 'http://localhost:4318/v1/logs');
  const [resourceLogs] = sent[0].body.resourceLogs;
  const service = resourceLogs.resource.attributes.find((a) => a.key === 'service.name');
  assert.deepEqual(service.value, { stringValue: 'demo' });
  const [record] = resourceLogs.scopeLogs[0].logRecords;
  assert.equal(record.severityNumber, T.SEVERITY.INFO);
  assert.equal(record.body.stringValue, 'hello');
  assert.deepEqual(record.attributes, [
    { key: 'level', value: { intValue: '2' } },
    { key: 'ratio', value: { doubleValue: 0.5 } },
    { key: 'ok', value: { boolValue: true } },
  ]);
  assert.match(record.timeUnixNano, /^\d+$/);
  assert.equal(await log.flush(), false, 'queue is empty after a send');
});

test('a failed export keeps records for a retry instead of throwing', async () => {
  let calls = 0;
  const log = logger({ endpoint: 'http://collector/v1/logs', fetch: async () => { calls++; throw new Error('offline'); } });
  log.warn('slow frame');
  assert.equal(await log.flush(), false);
  log.setEndpoint('http://collector');
  assert.equal(log.endpoint, 'http://collector/v1/logs');
  assert.equal(await log.flush(), false);
  assert.equal(calls, 2);
});

test('blocked or corrupt storage never breaks logging', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const log = T.create({ service: 'demo', storage: throwing });
  assert.doesNotThrow(() => log.error('still fine'));
  assert.deepEqual(T.loadRecords(memoryStorage({ 'demo.v1.log': '{bad' }), 'demo'), []);
});

test('the support report lists resource, records and stack lines', () => {
  const log = logger();
  log.event('job.start', { job: 1 });
  log.exception(new Error('kaput'));
  const report = log.report();
  assert.match(report, /support report: demo/);
  assert.match(report, /session\.id: [0-9a-f]+/);
  assert.match(report, /job\.start/);
  assert.match(report, /ERROR kaput/);
});

test('every game ships an identical copy, loaded before its own scripts', () => {
  const canonical = fs.readFileSync(path.join(ROOT, 'arcade', 'telemetry.js'), 'utf8');
  for (const game of GAMES) {
    const copy = fs.readFileSync(path.join(ROOT, 'games', game.slug, 'telemetry.js'), 'utf8');
    assert.equal(copy, canonical, `${game.slug}/telemetry.js is out of date: run npm run sync-telemetry`);
    const html = fs.readFileSync(path.join(ROOT, 'games', game.slug, 'index.html'), 'utf8');
    const tag = html.indexOf(`<script src="telemetry.js" data-service="${game.slug}"></script>`);
    assert.ok(tag > 0, `${game.slug} loads telemetry.js with its slug`);
    const first = html.search(/<script(?![^>]*telemetry\.js)[^>]*src=/);
    assert.ok(first === -1 || tag < first, `${game.slug} loads telemetry.js first`);
  }
});
