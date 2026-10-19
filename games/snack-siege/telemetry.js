// Telemetry for Starlight Arcade games: structured logs that follow the
// OpenTelemetry Logs data model, a crash screen, and optional OTLP/HTTP export.
//
// The canonical copy lives in arcade/telemetry.js. Each game keeps an identical
// copy in its own folder (games stay self-contained); `npm run sync-telemetry`
// refreshes them and the arcade tests check they match.
//
// In a browser, load it as a classic script before the game:
//   <script src="telemetry.js" data-service="my-game"></script>
// It installs error handlers at once and exposes window.Telemetry.log.
//
// Nothing leaves the device unless an OTLP endpoint is configured with
// `?otlp=<url>` (this site or a local collector only) or from the arcade's
// Help & diagnostics panel. Logs hold game events and errors only: no names,
// no input, nothing personal.
(function (root) {
  'use strict';

  const VERSION = '1';
  const MAX_RECORDS = 200;
  const ENDPOINT_KEY = 'telemetry.v1.endpoint';
  const SEVERITY = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17, FATAL: 21 };

  function logKey(service) {
    return `${service}.v1.log`;
  }

  function hex(random, bytes) {
    let out = '';
    for (let i = 0; i < bytes; i++) out += Math.floor(random() * 256).toString(16).padStart(2, '0');
    return out;
  }

  // Only plain values make it into attributes; anything else becomes text.
  function cleanAttributes(attributes) {
    const out = {};
    for (const [key, value] of Object.entries(attributes || {})) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'number') out[key] = Number.isFinite(value) ? value : String(value);
      else if (typeof value === 'boolean') out[key] = value;
      else out[key] = String(value).slice(0, 2000);
    }
    return out;
  }

  // Attributes for an error, using OpenTelemetry's exception conventions.
  function exceptionAttributes(error) {
    if (error && typeof error === 'object') {
      return {
        'exception.type': error.name || (error.constructor && error.constructor.name) || 'Error',
        'exception.message': String(error.message || error),
        'exception.stacktrace': String(error.stack || '').slice(0, 4000),
      };
    }
    return { 'exception.type': typeof error, 'exception.message': String(error) };
  }

  function safeGet(storage, key) {
    try {
      return storage ? storage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      if (storage) storage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadRecords(storage, service) {
    try {
      const data = JSON.parse(safeGet(storage, logKey(service)) || '[]');
      return Array.isArray(data) ? data.filter((r) => r && typeof r.time === 'number').slice(-MAX_RECORDS) : [];
    } catch (_) {
      return [];
    }
  }

  function otlpValue(value) {
    if (typeof value === 'boolean') return { boolValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
    return { stringValue: String(value) };
  }

  function otlpAttributes(attributes) {
    return Object.entries(attributes || {}).map(([key, value]) => ({ key, value: otlpValue(value) }));
  }

  // OTLP/HTTP JSON body for POST {endpoint}/v1/logs.
  function toOtlp(resource, records) {
    return {
      resourceLogs: [{
        resource: { attributes: otlpAttributes(resource) },
        scopeLogs: [{
          scope: { name: 'starlight-arcade.telemetry', version: VERSION },
          logRecords: records.map((r) => ({
            timeUnixNano: String(Math.round(r.time * 1e6)),
            observedTimeUnixNano: String(Math.round(r.time * 1e6)),
            severityNumber: SEVERITY[r.severity] || SEVERITY.INFO,
            severityText: r.severity,
            body: { stringValue: r.body },
            attributes: otlpAttributes(r.attributes),
            traceId: r.traceId,
            spanId: r.spanId,
          })),
        }],
      }],
    };
  }

  // `?otlp=` in a link may only aim at this site or a local collector. Any
  // other server would let a shared link start sending a visitor's logs
  // somewhere they never chose; those have to be entered in Help &
  // diagnostics. Returns the endpoint to save, '' to stop sending, or null to
  // refuse the link.
  const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
  function urlEndpoint(value, pageOrigin) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text === 'same') return pageOrigin;
    let url;
    try {
      url = new URL(text);
    } catch (_) {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin === pageOrigin || LOOPBACK.includes(url.hostname) ? text : null;
  }

  function applyUrlEndpoint(win, storage) {
    const params = new URLSearchParams(win.location.search);
    if (!params.has('otlp')) return;
    const value = urlEndpoint(params.get('otlp'), win.location.origin);
    if (value !== null) safeSet(storage, ENDPOINT_KEY, value);
  }

  function normalizeEndpoint(value) {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (!text) return '';
    return /\/v1\/logs$/.test(text) ? text : `${text}/v1/logs`;
  }

  // A logger for one game session. Everything it touches is passed in, so it
  // runs the same in Node tests and in the browser.
  function create(options) {
    const service = options.service || 'unknown-game';
    const storage = options.storage || null;
    const now = options.now || (() => Date.now());
    const random = options.random || Math.random;
    const fetcher = options.fetch || null;
    const sessionId = hex(random, 8);
    // One trace per page session, so a collector can group a whole play.
    const traceId = hex(random, 16);
    const records = loadRecords(storage, service);
    const queue = [];
    const listeners = [];
    let endpoint = normalizeEndpoint(options.endpoint);
    let persistTimer = 0;

    const resource = cleanAttributes({
      'service.name': service,
      'service.version': options.version || VERSION,
      'service.namespace': 'starlight-arcade',
      'session.id': sessionId,
      ...(options.resource || {}),
    });

    function persist() {
      persistTimer = 0;
      safeSet(storage, logKey(service), JSON.stringify(records));
    }

    function emit(severity, body, attributes) {
      const record = {
        time: now(),
        severity,
        body: String(body),
        attributes: cleanAttributes(attributes),
        traceId,
        spanId: hex(random, 8),
        session: sessionId,
      };
      records.push(record);
      if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
      if (endpoint) queue.push(record);
      // Errors are written straight away in case the page is about to go.
      if (severity === 'ERROR' || severity === 'FATAL') persist();
      else if (!persistTimer && options.setTimeout) persistTimer = options.setTimeout(persist, 1500);
      else if (!options.setTimeout) persist();
      for (const listener of listeners) listener(record);
      return record;
    }

    async function flush({ keepalive = false } = {}) {
      if (!endpoint || !fetcher || !queue.length) return false;
      const batch = queue.splice(0, queue.length);
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toOtlp(resource, batch)),
          keepalive,
        });
        if (response && response.ok === false) throw new Error(`HTTP ${response.status}`);
        return true;
      } catch (_) {
        // The collector is optional. Keep a few records to retry, never loop.
        queue.unshift(...batch.slice(-50));
        return false;
      }
    }

    const logger = {
      service,
      sessionId,
      traceId,
      resource,
      debug: (body, attributes) => emit('DEBUG', body, attributes),
      info: (body, attributes) => emit('INFO', body, attributes),
      warn: (body, attributes) => emit('WARN', body, attributes),
      error: (body, attributes) => emit('ERROR', body, attributes),
      // An OpenTelemetry event: a log record named by `event.name`.
      event: (name, attributes) => emit('INFO', name, { 'event.name': name, ...attributes }),
      exception(error, attributes = {}) {
        const fatal = !!attributes.fatal;
        const { fatal: _fatal, ...rest } = attributes;
        return emit(fatal ? 'FATAL' : 'ERROR', exceptionAttributes(error)['exception.message'], {
          ...exceptionAttributes(error),
          'exception.escaped': fatal,
          ...rest,
        });
      },
      records: () => records.slice(),
      recentErrors: () => records.filter((r) => r.severity === 'ERROR' || r.severity === 'FATAL'),
      onRecord: (listener) => listeners.push(listener),
      setEndpoint(value) {
        endpoint = normalizeEndpoint(value);
      },
      get endpoint() {
        return endpoint;
      },
      flush,
      persist,
      clear() {
        records.length = 0;
        queue.length = 0;
        persist();
      },
      report: () => formatReport(service, resource, records),
    };
    return logger;
  }

  function formatRecord(r) {
    const stamp = new Date(r.time).toISOString();
    const attributes = Object.entries(r.attributes || {})
      .filter(([key]) => key !== 'exception.stacktrace')
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const stack = r.attributes && r.attributes['exception.stacktrace'];
    return `${stamp} ${r.severity.padEnd(5)} ${r.body}${attributes ? `  ${attributes}` : ''}${stack ? `\n    ${stack.split('\n').slice(0, 8).join('\n    ')}` : ''}`;
  }

  // A plain-text report a player can paste into a support message.
  function formatReport(service, resource, records, limit = 60) {
    const lines = [
      `Starlight Arcade support report: ${service}`,
      ...Object.entries(resource).map(([key, value]) => `${key}: ${value}`),
      `records: ${records.length} (showing the last ${Math.min(limit, records.length)})`,
      '',
      ...records.slice(-limit).map(formatRecord),
    ];
    return lines.join('\n');
  }

  // ------------------------------------------------------------ browser side

  const CRASH_STYLE = `
    position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;
    background:rgba(8,6,24,.82);font-family:"Avenir Next","Segoe UI",ui-rounded,system-ui,sans-serif;color:#fff4e6;`;
  const CARD_STYLE = `
    max-width:440px;width:100%;padding:28px 26px;border-radius:20px;text-align:center;
    background:linear-gradient(180deg,#2c1766,#1a0d40);box-shadow:0 0 0 3px #3b2285,0 20px 50px rgba(0,0,0,.5);`;
  const BUTTON_STYLE = `
    display:inline-block;margin:6px;padding:12px 20px;border:0;border-radius:999px;cursor:pointer;
    font:700 16px "Avenir Next","Segoe UI",system-ui,sans-serif;text-decoration:none;`;

  // A friendly "something broke" screen. Built from scratch so it works even
  // when the game's own UI is what failed.
  function showCrash(doc, logger, { arcadeHref = '../../index.html' } = {}) {
    if (!doc || !doc.body || doc.getElementById('telemetry-crash')) return null;
    const overlay = doc.createElement('div');
    overlay.id = 'telemetry-crash';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'The game hit a bug');
    overlay.style.cssText = CRASH_STYLE;
    const card = doc.createElement('div');
    card.style.cssText = CARD_STYLE;
    const face = doc.createElement('div');
    face.textContent = '🙀';
    face.style.cssText = 'font-size:52px;line-height:1;margin-bottom:8px;';
    const title = doc.createElement('h2');
    title.textContent = 'Oops! The game hit a bug.';
    title.style.cssText = 'margin:0 0 8px;font-size:24px;';
    const text = doc.createElement('p');
    text.textContent = 'Your progress so far is saved. Try again, or pick another game. If it keeps happening, copy the report and send it to whoever looks after the arcade.';
    text.style.cssText = 'margin:0 0 18px;line-height:1.45;color:#e6ddff;';
    const retry = doc.createElement('button');
    retry.textContent = 'Try again';
    retry.style.cssText = `${BUTTON_STYLE}background:#5ef2ff;color:#120a2e;`;
    retry.addEventListener('click', () => doc.defaultView.location.reload());
    const back = doc.createElement('a');
    back.textContent = 'Back to arcade';
    back.href = arcadeHref;
    back.style.cssText = `${BUTTON_STYLE}background:#ffd35c;color:#120a2e;`;
    const copy = doc.createElement('button');
    copy.textContent = 'Copy report';
    copy.style.cssText = `${BUTTON_STYLE}background:rgba(255,255,255,.12);color:#fff;`;
    copy.addEventListener('click', async () => {
      const report = logger ? logger.report() : 'No report available.';
      try {
        await doc.defaultView.navigator.clipboard.writeText(report);
        copy.textContent = 'Copied!';
      } catch (_) {
        const area = doc.createElement('textarea');
        area.value = report;
        area.style.cssText = 'width:100%;height:140px;margin-top:12px;font:12px ui-monospace,monospace;';
        card.append(area);
        area.select();
        copy.textContent = 'Select and copy below';
      }
    });
    card.append(face, title, text, retry, back, copy);
    overlay.append(card);
    doc.body.append(overlay);
    try {
      retry.focus();
    } catch (_) {
      // Focus is a nicety.
    }
    return overlay;
  }

  // Catch what the game didn't: uncaught errors stop a requestAnimationFrame
  // loop dead, so they are fatal and get the crash screen. Rejected promises
  // (often audio that could not start) are logged and play carries on.
  function install(win, logger, { arcadeHref } = {}) {
    let crashed = false;
    const crash = (error, source) => {
      logger.exception(error, { fatal: true, 'error.source': source });
      logger.flush({ keepalive: true });
      if (!crashed) {
        crashed = true;
        showCrash(win.document, logger, { arcadeHref });
      }
    };
    win.addEventListener('error', (event) => {
      // Resource errors (a missing image) have no error object; just log them.
      if (!event.error && !event.message) {
        logger.warn('resource failed to load', { 'url.full': event.target && (event.target.src || event.target.href) });
        return;
      }
      crash(event.error || new Error(event.message), `${event.filename || ''}:${event.lineno || 0}`);
    }, true);
    win.addEventListener('unhandledrejection', (event) => {
      logger.exception(event.reason, { 'error.source': 'unhandledrejection' });
    });
    win.addEventListener('pagehide', () => {
      logger.persist();
      logger.flush({ keepalive: true });
    });
    win.document.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState === 'hidden') logger.flush({ keepalive: true });
    });
    win.setInterval(() => logger.flush(), 10000);
    // Call guard(fn) around a game loop callback so a crash inside it is caught
    // and reported with the crash screen instead of a frozen picture.
    return {
      crash,
      guard(fn, label = 'frame') {
        return function guarded(...args) {
          if (crashed) return undefined;
          try {
            return fn.apply(this, args);
          } catch (error) {
            crash(error, label);
            return undefined;
          }
        };
      },
      get crashed() {
        return crashed;
      },
    };
  }

  function browserBoot(win) {
    const script = win.document.currentScript;
    const service = (script && script.dataset.service) ||
      win.location.pathname.split('/').filter(Boolean).slice(-2, -1)[0] || 'arcade';
    let storage = null;
    try {
      storage = win.localStorage;
    } catch (_) {
      storage = null;
    }
    applyUrlEndpoint(win, storage);
    const logger = create({
      service,
      storage,
      endpoint: safeGet(storage, ENDPOINT_KEY) || '',
      fetch: win.fetch ? win.fetch.bind(win) : null,
      setTimeout: win.setTimeout.bind(win),
      resource: {
        'user_agent.original': win.navigator.userAgent,
        'browser.language': win.navigator.language,
        'screen.size': `${win.screen.width}x${win.screen.height}@${win.devicePixelRatio || 1}`,
        'url.path': win.location.pathname,
      },
    });
    const handlers = install(win, logger, { arcadeHref: script && script.dataset.arcade });
    logger.event('session.start', { referrer: win.document.referrer ? new URL(win.document.referrer).pathname : '' });
    // Copy descriptors, not values: a spread would freeze `crashed` at false.
    return Object.defineProperties({ log: logger }, Object.getOwnPropertyDescriptors(handlers));
  }

  const Telemetry = {
    VERSION, ENDPOINT_KEY, MAX_RECORDS, SEVERITY,
    create, install, showCrash, toOtlp, formatReport, loadRecords, logKey, normalizeEndpoint, exceptionAttributes,
    urlEndpoint, applyUrlEndpoint,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Telemetry;
  } else {
    // defineProperties (not Object.assign) keeps `crashed` a live getter.
    Object.defineProperties(Telemetry, Object.getOwnPropertyDescriptors(browserBoot(root)));
    root.Telemetry = Telemetry;
  }
})(typeof window !== 'undefined' ? window : globalThis);
