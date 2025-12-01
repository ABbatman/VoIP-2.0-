// static/js/workers/aggregationWorkerClient.js
// Responsibility: Promise-based wrapper for aggregation worker

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let worker = null;
let requestId = 0;
const pending = new Map();

const DEFAULT_TIMEOUT = 10000;

// ─────────────────────────────────────────────────────────────
// Worker management
// ─────────────────────────────────────────────────────────────

function getWorker() {
  if (worker) return worker;

  try {
    worker = new Worker(new URL('./aggregation.worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = e => {
      const { type, requestId: id, result, error } = e.data;
      const req = pending.get(id);
      if (!req) return;

      pending.delete(id);
      type === 'SUCCESS' ? req.resolve(result) : req.reject(new Error(error));
    };

    worker.onerror = () => {
      for (const [id, { reject }] of pending) {
        reject(new Error('Worker error'));
        pending.delete(id);
      }
    };

    return worker;
  } catch (e) {
    return null;
  }
}

function sendToWorker(type, payload, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) return reject(new Error('Worker not available'));

    const id = ++requestId;
    const tid = setTimeout(() => { pending.delete(id); reject(new Error('Worker timeout')); }, timeout);

    pending.set(id, {
      resolve: r => { clearTimeout(tid); resolve(r); },
      reject: e => { clearTimeout(tid); reject(e); }
    });

    w.postMessage({ type, payload, requestId: id });
  });
}

// ─────────────────────────────────────────────────────────────
// Async API (with worker)
// ─────────────────────────────────────────────────────────────

export async function filterByZoomAsync(hourlyRows, fromTs, toTs) {
  try { return await sendToWorker('FILTER_BY_ZOOM', { hourlyRows, fromTs, toTs }); }
  catch { return filterByZoomSync(hourlyRows, fromTs, toTs); }
}

export async function aggregatePeerRowsAsync(hourlyRows) {
  try { return await sendToWorker('AGGREGATE_PEER_ROWS', { hourlyRows }); }
  catch { return aggregatePeerRowsSync(hourlyRows); }
}

export async function aggregateMainRowsAsync(peerRows) {
  try { return await sendToWorker('AGGREGATE_MAIN_ROWS', { peerRows }); }
  catch { return aggregateMainRowsSync(peerRows); }
}

export async function fullReaggregationAsync(hourlyRows, fromTs, toTs) {
  try { return await sendToWorker('FULL_REAGGREGATION', { hourlyRows, fromTs, toTs }); }
  catch {
    const filtered = filterByZoomSync(hourlyRows, fromTs, toTs);
    const peerRows = aggregatePeerRowsSync(filtered);
    const mainRows = aggregateMainRowsSync(peerRows);
    return { hourlyRows: filtered, peerRows, mainRows };
  }
}

export function terminateWorker() {
  worker?.terminate();
  worker = null;
  pending.clear();
}

// ─────────────────────────────────────────────────────────────
// Sync fallbacks
// ─────────────────────────────────────────────────────────────

const TS_FIELDS = ['time', 'Time', 'timestamp', 'Timestamp', 'slot', 'Slot', 'hour', 'Hour', 'datetime', 'DateTime', 'ts', 'TS'];
const num = v => parseFloat(v) || 0;
const int = v => parseInt(v, 10) || 0;
const round1 = v => Math.round(v * 10) / 10;

function parseRowTs(r) {
  for (const f of TS_FIELDS) {
    const val = r[f];
    if (val == null) continue;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const d = new Date(val.replace(' ', 'T') + (val.includes('Z') ? '' : 'Z'));
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  return 0;
}

export function filterByZoomSync(hourlyRows, fromTs, toTs) {
  if (!Array.isArray(hourlyRows)) return [];
  return hourlyRows.filter(r => { const ts = parseRowTs(r); return ts >= fromTs && ts <= toTs; });
}

export function aggregatePeerRowsSync(hourlyRows) {
  if (!hourlyRows?.length) return [];

  const groups = new Map();
  for (const row of hourlyRows) {
    const key = `${row.main || ''}|${row.peer || ''}|${row.destination || ''}`;
    if (!groups.has(key)) groups.set(key, { main: row.main, peer: row.peer, destination: row.destination, Min: 0, SCall: 0, TCall: 0 });
    const g = groups.get(key);
    g.Min += num(row.Min); g.SCall += int(row.SCall); g.TCall += int(row.TCall);
  }

  const result = [];
  for (const g of groups.values()) {
    result.push({
      main: g.main, peer: g.peer, destination: g.destination,
      Min: round1(g.Min), SCall: g.SCall, TCall: g.TCall,
      ASR: g.TCall > 0 ? Math.min(100, round1((g.SCall / g.TCall) * 100)) : 0,
      ACD: g.SCall > 0 ? round1(g.Min / g.SCall) : 0
    });
  }
  return result;
}

export function aggregateMainRowsSync(peerRows) {
  if (!peerRows?.length) return [];

  const groups = new Map();
  for (const row of peerRows) {
    const key = `${row.main || ''}|${row.destination || ''}`;
    if (!groups.has(key)) groups.set(key, { main: row.main, destination: row.destination, Min: 0, SCall: 0, TCall: 0 });
    const g = groups.get(key);
    g.Min += num(row.Min); g.SCall += int(row.SCall); g.TCall += int(row.TCall);
  }

  const result = [];
  for (const g of groups.values()) {
    result.push({
      main: g.main, destination: g.destination,
      Min: round1(g.Min), SCall: g.SCall, TCall: g.TCall,
      ASR: g.TCall > 0 ? Math.min(100, round1((g.SCall / g.TCall) * 100)) : 0,
      ACD: g.SCall > 0 ? round1(g.Min / g.SCall) : 0
    });
  }
  return result;
}
