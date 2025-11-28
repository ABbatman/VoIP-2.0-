// static/js/workers/aggregation.worker.js
// Web Worker for CPU-intensive re-aggregation during chart zoom
// Offloads calculations from main thread to prevent UI blocking

/**
 * Parse timestamp from row
 */
function parseRowTs(r) {
  const val = r.time || r.Time || r.timestamp || r.Timestamp || r.slot || r.Slot || 
              r.hour || r.Hour || r.datetime || r.DateTime || r.ts || r.TS;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const d = new Date(val.replace(' ', 'T') + (val.includes('Z') ? '' : 'Z'));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

/**
 * Filter hourly rows by zoom time range
 */
function filterByZoom(hourlyRows, fromTs, toTs) {
  if (!Array.isArray(hourlyRows)) return [];
  return hourlyRows.filter(r => {
    const ts = parseRowTs(r);
    return ts >= fromTs && ts <= toTs;
  });
}

/**
 * Aggregate peer rows from hourly data
 * Groups by (main, peer, destination)
 */
function aggregatePeerRows(hourlyRows) {
  if (!Array.isArray(hourlyRows) || hourlyRows.length === 0) return [];
  
  const groups = new Map();
  
  for (const row of hourlyRows) {
    const key = `${row.main || ''}|${row.peer || ''}|${row.destination || ''}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        main: row.main,
        peer: row.peer,
        destination: row.destination,
        Min: 0,
        SCall: 0,
        TCall: 0,
        // For weighted averages
        _seconds: 0,
        _pddWeighted: 0,
        _atimeWeighted: 0,
        _uniqAttempts: 0,
      });
    }
    
    const g = groups.get(key);
    g.Min += parseFloat(row.Min) || 0;
    g.SCall += parseInt(row.SCall) || 0;
    g.TCall += parseInt(row.TCall) || 0;
    g._seconds += (parseFloat(row.Min) || 0) * 60; // Convert back to seconds
    g._pddWeighted += (parseFloat(row.PDD) || 0) * (parseInt(row.TCall) || 0);
    g._atimeWeighted += (parseFloat(row.ATime) || 0) * (parseInt(row.SCall) || 0);
    g._uniqAttempts += parseInt(row.TCall) || 0;
  }
  
  const result = [];
  for (const g of groups.values()) {
    // Calculate derived metrics
    const asr = g.TCall > 0 ? Math.min(100, Math.round((g.SCall / g.TCall) * 100 * 10) / 10) : 0;
    const acd = g.SCall > 0 ? Math.round((g.Min / g.SCall) * 10) / 10 : 0;
    const pdd = g._uniqAttempts > 0 ? Math.round((g._pddWeighted / g._uniqAttempts) * 10) / 10 : 0;
    const atime = g.SCall > 0 ? Math.round((g._atimeWeighted / g.SCall) * 10) / 10 : 0;
    
    result.push({
      main: g.main,
      peer: g.peer,
      destination: g.destination,
      Min: Math.round(g.Min * 10) / 10,
      SCall: g.SCall,
      TCall: g.TCall,
      ASR: asr,
      ACD: acd,
      PDD: pdd,
      ATime: atime,
    });
  }
  
  return result;
}

/**
 * Aggregate main rows from peer rows
 * Groups by (main, destination)
 */
function aggregateMainRows(peerRows) {
  if (!Array.isArray(peerRows) || peerRows.length === 0) return [];
  
  const groups = new Map();
  
  for (const row of peerRows) {
    const key = `${row.main || ''}|${row.destination || ''}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        main: row.main,
        destination: row.destination,
        Min: 0,
        SCall: 0,
        TCall: 0,
      });
    }
    
    const g = groups.get(key);
    g.Min += parseFloat(row.Min) || 0;
    g.SCall += parseInt(row.SCall) || 0;
    g.TCall += parseInt(row.TCall) || 0;
  }
  
  const result = [];
  for (const g of groups.values()) {
    const asr = g.TCall > 0 ? Math.min(100, Math.round((g.SCall / g.TCall) * 100 * 10) / 10) : 0;
    const acd = g.SCall > 0 ? Math.round((g.Min / g.SCall) * 10) / 10 : 0;
    
    result.push({
      main: g.main,
      destination: g.destination,
      Min: Math.round(g.Min * 10) / 10,
      SCall: g.SCall,
      TCall: g.TCall,
      ASR: asr,
      ACD: acd,
    });
  }
  
  return result;
}

/**
 * Compute footer aggregates
 */
function computeAggregates(mainRows) {
  if (!Array.isArray(mainRows)) return null;
  
  let totalMinutes = 0;
  let totalSuccessfulCalls = 0;
  let totalCalls = 0;
  let yTotalMinutes = 0;
  let yTotalSuccessfulCalls = 0;
  let yTotalCalls = 0;
  
  for (const row of mainRows) {
    totalMinutes += parseFloat(row.Min) || 0;
    totalSuccessfulCalls += parseInt(row.SCall) || 0;
    totalCalls += parseInt(row.TCall) || 0;
    yTotalMinutes += parseFloat(row.YMin) || 0;
    yTotalSuccessfulCalls += parseInt(row.YSCall) || 0;
    yTotalCalls += parseInt(row.YTCall) || 0;
  }
  
  const acdAvg = totalSuccessfulCalls > 0 ? totalMinutes / totalSuccessfulCalls : 0;
  const asrAvg = totalCalls > 0 ? (totalSuccessfulCalls / totalCalls) * 100 : 0;
  const yAcdAvg = yTotalSuccessfulCalls > 0 ? yTotalMinutes / yTotalSuccessfulCalls : 0;
  const yAsrAvg = yTotalCalls > 0 ? (yTotalSuccessfulCalls / yTotalCalls) * 100 : 0;
  
  const percentChange = (now, prev) => Math.abs(prev) > 0 ? ((now - prev) / Math.abs(prev)) * 100 : 0;
  
  return {
    curr: {
      totalMinutes: Math.round(totalMinutes * 10) / 10,
      totalSuccessfulCalls,
      totalCalls,
      acdAvg: Math.round(acdAvg * 10) / 10,
      asrAvg: Math.round(asrAvg * 10) / 10,
    },
    y: {
      totalMinutes: Math.round(yTotalMinutes * 10) / 10,
      totalSuccessfulCalls: yTotalSuccessfulCalls,
      totalCalls: yTotalCalls,
      acdAvg: Math.round(yAcdAvg * 10) / 10,
      asrAvg: Math.round(yAsrAvg * 10) / 10,
    },
    delta: {
      totalMinutes: Math.round(percentChange(totalMinutes, yTotalMinutes) * 10) / 10,
      totalSuccessfulCalls: Math.round(percentChange(totalSuccessfulCalls, yTotalSuccessfulCalls) * 10) / 10,
      totalCalls: Math.round(percentChange(totalCalls, yTotalCalls) * 10) / 10,
      acdAvg: Math.round(percentChange(acdAvg, yAcdAvg) * 10) / 10,
      asrAvg: Math.round(percentChange(asrAvg, yAsrAvg) * 10) / 10,
    }
  };
}

// Message handler
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
        
      case 'FULL_REAGGREGATION':
        // Full pipeline: filter -> peer -> main -> aggregates
        const filtered = filterByZoom(payload.hourlyRows, payload.fromTs, payload.toTs);
        const peerRows = aggregatePeerRows(filtered);
        const mainRows = aggregateMainRows(peerRows);
        const aggregates = computeAggregates(mainRows);
        result = {
          hourlyRows: filtered,
          peerRows,
          mainRows,
          aggregates,
        };
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    self.postMessage({
      type: 'SUCCESS',
      requestId,
      result,
    });
    
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      requestId,
      error: error.message,
    });
  }
};
