// static/js/workers/aggregation.worker.js
// Responsibility: Off-thread aggregation during chart zoom

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// use Set for O(1) lookup of time fields
const TS_FIELDS_SET = new Set(['time', 'Time', 'timestamp', 'Timestamp', 'slot', 'Slot', 'hour', 'Hour', 'datetime', 'DateTime', 'ts', 'TS']);

function parseRowTs(r) {
  // fast path: check common keys first
  let val = r.time ?? r.Time ?? r.timestamp ?? r.slot ?? r.hour ?? r.ts;

  // fallback to full search
  if (val == null) {
    for (const key in r) {
      if (TS_FIELDS_SET.has(key)) {
        val = r[key];
        break;
      }
    }
  }

  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const d = new Date(val.replace(' ', 'T') + (val.includes('Z') ? '' : 'Z'));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}

const num = v => parseFloat(v) || 0;
const int = v => parseInt(v, 10) || 0;
const round1 = v => Math.round(v * 10) / 10;

// ─────────────────────────────────────────────────────────────
// Filter
// ─────────────────────────────────────────────────────────────

function filterByZoom(hourlyRows, fromTs, toTs) {
  if (!Array.isArray(hourlyRows)) return [];
  // use indexed loop instead of filter
  const result = [];
  const len = hourlyRows.length;
  for (let i = 0; i < len; i++) {
    const r = hourlyRows[i];
    const ts = parseRowTs(r);
    if (ts >= fromTs && ts <= toTs) {
      result.push(r);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Aggregation: peer rows
// ─────────────────────────────────────────────────────────────

function aggregatePeerRows(hourlyRows) {
  if (!hourlyRows?.length) return [];

  const groups = new Map();

  for (const row of hourlyRows) {
    const key = `${row.main || ''}|${row.peer || ''}|${row.destination || ''}`;

    if (!groups.has(key)) {
      groups.set(key, {
        main: row.main, peer: row.peer, destination: row.destination,
        Min: 0, SCall: 0, TCall: 0, _pddW: 0, _atimeW: 0, _attempts: 0
      });
    }

    const g = groups.get(key);
    g.Min += num(row.Min);
    g.SCall += int(row.SCall);
    g.TCall += int(row.TCall);
    g._pddW += num(row.PDD) * int(row.TCall);
    g._atimeW += num(row.ATime) * int(row.SCall);
    g._attempts += int(row.TCall);
  }

  const result = [];
  for (const g of groups.values()) {
    result.push({
      main: g.main, peer: g.peer, destination: g.destination,
      Min: round1(g.Min),
      SCall: g.SCall,
      TCall: g.TCall,
      ASR: g.TCall > 0 ? Math.min(100, round1((g.SCall / g.TCall) * 100)) : 0,
      ACD: g.SCall > 0 ? round1(g.Min / g.SCall) : 0,
      PDD: g._attempts > 0 ? round1(g._pddW / g._attempts) : 0,
      ATime: g.SCall > 0 ? round1(g._atimeW / g.SCall) : 0
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Aggregation: main rows
// ─────────────────────────────────────────────────────────────

function aggregateMainRows(peerRows) {
  if (!peerRows?.length) return [];

  const groups = new Map();

  for (const row of peerRows) {
    const key = `${row.main || ''}|${row.destination || ''}`;

    if (!groups.has(key)) {
      groups.set(key, { main: row.main, destination: row.destination, Min: 0, SCall: 0, TCall: 0 });
    }

    const g = groups.get(key);
    g.Min += num(row.Min);
    g.SCall += int(row.SCall);
    g.TCall += int(row.TCall);
  }

  const result = [];
  for (const g of groups.values()) {
    result.push({
      main: g.main, destination: g.destination,
      Min: round1(g.Min),
      SCall: g.SCall,
      TCall: g.TCall,
      ASR: g.TCall > 0 ? Math.min(100, round1((g.SCall / g.TCall) * 100)) : 0,
      ACD: g.SCall > 0 ? round1(g.Min / g.SCall) : 0
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Aggregation: footer totals
// ─────────────────────────────────────────────────────────────

function computeAggregates(mainRows) {
  if (!Array.isArray(mainRows)) return null;

  let tMin = 0, tSCall = 0, tTCall = 0;
  let yMin = 0, ySCall = 0, yTCall = 0;

  for (const r of mainRows) {
    tMin += num(r.Min); tSCall += int(r.SCall); tTCall += int(r.TCall);
    yMin += num(r.YMin); ySCall += int(r.YSCall); yTCall += int(r.YTCall);
  }

  const acd = tSCall > 0 ? tMin / tSCall : 0;
  const asr = tTCall > 0 ? (tSCall / tTCall) * 100 : 0;
  const yAcd = ySCall > 0 ? yMin / ySCall : 0;
  const yAsr = yTCall > 0 ? (ySCall / yTCall) * 100 : 0;
  const pct = (now, prev) => Math.abs(prev) > 0 ? ((now - prev) / Math.abs(prev)) * 100 : 0;

  return {
    curr: { totalMinutes: round1(tMin), totalSuccessfulCalls: tSCall, totalCalls: tTCall, acdAvg: round1(acd), asrAvg: round1(asr) },
    y: { totalMinutes: round1(yMin), totalSuccessfulCalls: ySCall, totalCalls: yTCall, acdAvg: round1(yAcd), asrAvg: round1(yAsr) },
    delta: {
      totalMinutes: round1(pct(tMin, yMin)),
      totalSuccessfulCalls: round1(pct(tSCall, ySCall)),
      totalCalls: round1(pct(tTCall, yTCall)),
      acdAvg: round1(pct(acd, yAcd)),
      asrAvg: round1(pct(asr, yAsr))
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Message handler
// ─────────────────────────────────────────────────────────────

self.onmessage = function(e) {
  const { type, payload, requestId } = e.data;

  try {
    let result;

    switch (type) {
      case 'FILTER_BY_ZOOM':
        result = filterByZoom(payload.hourlyRows, payload.fromTs, payload.toTs);
        break;
      case 'AGGREGATE_PEER_ROWS':
        result = aggregatePeerRows(payload.hourlyRows);
        break;
      case 'AGGREGATE_MAIN_ROWS':
        result = aggregateMainRows(payload.peerRows);
        break;
      case 'COMPUTE_AGGREGATES':
        result = computeAggregates(payload.mainRows);
        break;
      case 'FULL_REAGGREGATION': {
        const filtered = filterByZoom(payload.hourlyRows, payload.fromTs, payload.toTs);
        const peerRows = aggregatePeerRows(filtered);
        const mainRows = aggregateMainRows(peerRows);
        result = { hourlyRows: filtered, peerRows, mainRows, aggregates: computeAggregates(mainRows) };
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ type: 'SUCCESS', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'ERROR', requestId, error: error.message });
  }
};
