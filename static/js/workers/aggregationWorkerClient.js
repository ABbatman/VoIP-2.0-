// static/js/workers/aggregationWorkerClient.js
// Client wrapper for aggregation Web Worker
// Provides Promise-based API and fallback to main thread

let worker = null;
let requestId = 0;
const pendingRequests = new Map();

/**
 * Initialize worker (lazy)
 */
function getWorker() {
  if (worker) return worker;
  
  try {
    // Create worker from URL
    worker = new Worker(new URL('./aggregation.worker.js', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type, requestId, result, error } = e.data;
      const pending = pendingRequests.get(requestId);
      
      if (pending) {
        pendingRequests.delete(requestId);
        if (type === 'SUCCESS') {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error));
        }
      }
    };
    
    worker.onerror = (e) => {
      console.error('[aggregationWorker] Worker error:', e);
      // Reject all pending requests
      for (const [id, { reject }] of pendingRequests) {
        reject(new Error('Worker error'));
        pendingRequests.delete(id);
      }
    };
    
    return worker;
  } catch (e) {
    console.warn('[aggregationWorker] Failed to create worker, will use main thread:', e);
    return null;
  }
}

/**
 * Send message to worker and return Promise
 */
function sendToWorker(type, payload, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    
    if (!w) {
      // Fallback to main thread (import synchronous implementation)
      reject(new Error('Worker not available'));
      return;
    }
    
    const id = ++requestId;
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Worker timeout'));
    }, timeout);
    
    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });
    
    w.postMessage({ type, payload, requestId: id });
  });
}

/**
 * Filter hourly rows by zoom range using worker
 */
export async function filterByZoomAsync(hourlyRows, fromTs, toTs) {
  try {
    return await sendToWorker('FILTER_BY_ZOOM', { hourlyRows, fromTs, toTs });
  } catch (e) {
    // Fallback to synchronous
    return filterByZoomSync(hourlyRows, fromTs, toTs);
  }
}

/**
 * Aggregate peer rows using worker
 */
export async function aggregatePeerRowsAsync(hourlyRows) {
  try {
    return await sendToWorker('AGGREGATE_PEER_ROWS', { hourlyRows });
  } catch (e) {
    return aggregatePeerRowsSync(hourlyRows);
  }
}

/**
 * Aggregate main rows using worker
 */
export async function aggregateMainRowsAsync(peerRows) {
  try {
    return await sendToWorker('AGGREGATE_MAIN_ROWS', { peerRows });
  } catch (e) {
    return aggregateMainRowsSync(peerRows);
  }
}

/**
 * Full re-aggregation pipeline using worker
 */
export async function fullReaggregationAsync(hourlyRows, fromTs, toTs) {
  try {
    return await sendToWorker('FULL_REAGGREGATION', { hourlyRows, fromTs, toTs });
  } catch (e) {
    // Fallback to synchronous full pipeline
    const filtered = filterByZoomSync(hourlyRows, fromTs, toTs);
    const peerRows = aggregatePeerRowsSync(filtered);
    const mainRows = aggregateMainRowsSync(peerRows);
    return { hourlyRows: filtered, peerRows, mainRows };
  }
}

/**
 * Terminate worker (cleanup)
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    pendingRequests.clear();
  }
}

// Synchronous fallback implementations

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

function filterByZoomSync(hourlyRows, fromTs, toTs) {
  if (!Array.isArray(hourlyRows)) return [];
  return hourlyRows.filter(r => {
    const ts = parseRowTs(r);
    return ts >= fromTs && ts <= toTs;
  });
}

function aggregatePeerRowsSync(hourlyRows) {
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
      peer: g.peer,
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

function aggregateMainRowsSync(peerRows) {
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

// Export sync versions for direct use
export { filterByZoomSync, aggregatePeerRowsSync, aggregateMainRowsSync };
