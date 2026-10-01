// Turns an OTLP/HTTP JSON logs request into flat records the dev server can
// append to a file and print. Pure, so tests can feed it requests directly.

function plain(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('intValue' in value) return Number(value.intValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('boolValue' in value) return value.boolValue;
  return JSON.stringify(value);
}

function attributeMap(list) {
  const out = {};
  for (const item of list || []) out[item.key] = plain(item.value);
  return out;
}

export function flattenLogs(request) {
  const records = [];
  for (const resourceLogs of request?.resourceLogs || []) {
    const resource = attributeMap(resourceLogs.resource?.attributes);
    for (const scopeLogs of resourceLogs.scopeLogs || []) {
      for (const record of scopeLogs.logRecords || []) {
        const nanos = Number(record.timeUnixNano || record.observedTimeUnixNano || 0);
        records.push({
          time: new Date(nanos / 1e6 || Date.now()).toISOString(),
          service: resource['service.name'] || 'unknown',
          session: resource['session.id'],
          severity: record.severityText || String(record.severityNumber || ''),
          severityNumber: record.severityNumber || 0,
          body: plain(record.body),
          attributes: attributeMap(record.attributes),
          traceId: record.traceId,
          spanId: record.spanId,
        });
      }
    }
  }
  return records;
}

// One console line per record, with the stack trace's first frames for errors.
export function describe(record) {
  const { 'exception.stacktrace': stack, ...rest } = record.attributes;
  const details = Object.entries(rest).map(([key, value]) => `${key}=${value}`).join(' ');
  const head = `[${record.service}] ${record.severity} ${record.body}${details ? `  ${details}` : ''}`;
  return stack ? `${head}\n  ${String(stack).split('\n').slice(0, 4).join('\n  ')}` : head;
}
