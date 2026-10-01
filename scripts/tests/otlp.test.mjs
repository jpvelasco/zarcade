import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, flattenLogs } from '../otlp.mjs';

const require = createRequire(import.meta.url);
const Telemetry = require('../../arcade/telemetry.js');

test('flattenLogs reads back what the games send', () => {
  let seed = 3;
  const log = Telemetry.create({ service: 'neon-nighthawk', now: () => 1_700_000_000_000, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
  log.warn('frame.stall', { 'stall.ms': 2300, screen: 'play' });
  log.exception(new Error('kaput'), { fatal: true });
  const request = Telemetry.toOtlp(log.resource, log.records());
  const [stall, crash] = flattenLogs(JSON.parse(JSON.stringify(request)));
  assert.equal(stall.service, 'neon-nighthawk');
  assert.equal(stall.session, log.sessionId);
  assert.equal(stall.severity, 'WARN');
  assert.equal(stall.time, new Date(1_700_000_000_000).toISOString());
  assert.deepEqual(stall.attributes, { 'stall.ms': 2300, screen: 'play' });
  assert.equal(crash.severity, 'FATAL');
  assert.match(describe(crash), /\[neon-nighthawk\] FATAL kaput[\s\S]*Error: kaput/);
});

test('flattenLogs tolerates empty or partial requests', () => {
  assert.deepEqual(flattenLogs(null), []);
  assert.deepEqual(flattenLogs({ resourceLogs: [{ scopeLogs: [{}] }] }), []);
  const [record] = flattenLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: { stringValue: 'hi' } }] }] }] });
  assert.equal(record.service, 'unknown');
  assert.equal(record.body, 'hi');
});
