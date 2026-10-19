// Minimal static file server for local play. Sends no-store so the browser
// always loads the latest code after an edit.
//
// It also accepts OpenTelemetry logs (OTLP/HTTP JSON) at POST /v1/logs, so the
// games' telemetry can be pointed at it from the arcade's Help & diagnostics
// panel. Records are appended to logs/telemetry.ndjson, and warnings and
// errors are printed here.
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { describe, flattenLogs } from './otlp.mjs';

const root = resolve(process.argv[2] || '.');
const port = Number(process.env.PORT) || 8000;
const logFile = join(root, 'logs', 'telemetry.ndjson');
const MAX_BODY = 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function readBody(req) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

async function receiveLogs(req, res) {
  try {
    const records = flattenLogs(JSON.parse(await readBody(req)));
    if (records.length) {
      await mkdir(join(root, 'logs'), { recursive: true });
      await appendFile(logFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    for (const record of records) {
      if (record.severityNumber >= 13) console.log(describe(record));
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end('{"partialSuccess":{}}');
  } catch (err) {
    res.writeHead(err.status || 400, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: err.status === 413 ? 'payload too large' : 'invalid OTLP JSON' }));
  }
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/v1/logs') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (req.method === 'POST') {
      await receiveLogs(req, res);
      return;
    }
  }
  try {
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'EACCES' ? 403 : 404, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'EACCES' ? 'Forbidden' : 'Not found');
  }
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
  console.log(`Telemetry: POST http://localhost:${port}/v1/logs (OTLP JSON) -> ${logFile}`);
});
