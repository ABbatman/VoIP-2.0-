// static/js/state/store.js
// Responsibility: Unified store facade over stateManager
import { stateManager } from './stateManager.js';
import { publish } from './eventBus.js';
import { reducer as filtersReducer } from './reducers/filtersReducer.js';
import { reducer as tableReducer } from './reducers/tableReducer.js';
import { setFilters } from './appState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import {
  setDisplaySettings, setColumnSettings, setBehaviorSettings,
  setPerformanceSettings, setExportSettings, setGlobalFilter,
  setColumnFilter, resetColumnFilters, setMultiSort
} from './tableState.js';

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const state = { current: stateManager.getCompleteState() };
let debug = false;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    logError(ErrorCategory.STATE, 'store:deepEqual', e);
    return a === b;
  }
}

function isDebugEnabled() {
  return (typeof window !== 'undefined' && window.DEBUG === true) || debug;
}

function safeCall(fn, context) {
  try { fn(); } catch (e) { logError(ErrorCategory.STATE, context, e); }
}

// ─────────────────────────────────────────────────────────────
// Debug API
// ─────────────────────────────────────────────────────────────

export const setDebugLogging = enabled => { debug = !!enabled; };
export const isDebugLoggingEnabled = () => debug;

// ─────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────

export function getState() {
  return state.current;
}

export { state };

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('subscribe(listener) requires a function');
  }

  const wrapped = nextState => {
    state.current = nextState;
    safeCall(() => listener(nextState), 'store:listener');
  };

  stateManager.addStateChangeListener(wrapped);

  // notify immediately with current state
  safeCall(() => listener(state.current), 'store:listener:init');

  return () => stateManager.removeStateChangeListener(wrapped);
}

// ─────────────────────────────────────────────────────────────
// Dispatch: Action processing
// ─────────────────────────────────────────────────────────────

export function dispatch(action) {
  validateAction(action);

  const { type, payload } = action;

  // publish action to eventBus
  safeCall(() => {
    publish('action', { type, payload });
    publish(`action:${type}`, payload);
  }, 'store:dispatch:publish');

  // run through reducers
  const prev = stateManager.getCompleteState();
  const next = tableReducer(filtersReducer(prev, action), action);

  if (isDebugEnabled()) {
    console.log('[store.dispatch] action:', { type, payload });
    console.log('[store.dispatch] next (reduced):', next);
  }

  // commit changes via setters
  safeCall(() => commitChanges(prev, next), 'store:dispatch:commit');

  // update snapshot after microtask
  queueMicrotask(() => {
    state.current = stateManager.getCompleteState();
    if (isDebugEnabled()) {
      console.log('[store.dispatch] state after commit:', state.current);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Dispatch helpers
// ─────────────────────────────────────────────────────────────

function validateAction(action) {
  if (!action || typeof action !== 'object') {
    throw new TypeError('dispatch(action) requires an object');
  }
  if (!action.type || typeof action.type !== 'string') {
    throw new TypeError('dispatch(action) requires a string type field');
  }
}

function commitChanges(prev, next) {
  // app filters
  if (next.app && prev.app && !deepEqual(next.app.filters, prev.app.filters)) {
    setFilters(next.app.filters || {});
  }

  if (!next.table || !prev.table) return;

  // table sections
  commitIfChanged(prev.table.display, next.table.display, setDisplaySettings);
  commitIfChanged(prev.table.columns, next.table.columns, setColumnSettings);
  commitIfChanged(prev.table.behavior, next.table.behavior, setBehaviorSettings);
  commitIfChanged(prev.table.performance, next.table.performance, setPerformanceSettings);
  commitIfChanged(prev.table.export, next.table.export, setExportSettings);

  // global filter
  if (next.table.globalFilterQuery !== prev.table.globalFilterQuery) {
    setGlobalFilter(next.table.globalFilterQuery || '');
  }

  // column filters
  if (!deepEqual(next.table.columnFilters, prev.table.columnFilters)) {
    resetColumnFilters();
    const cf = next.table.columnFilters || {};
    // use for-in instead of Object.keys().forEach()
    for (const k in cf) {
      if (cf[k]) setColumnFilter(k, cf[k]);
    }
  }

  // multi-sort
  if (!deepEqual(next.table.multiSort, prev.table.multiSort) && Array.isArray(next.table.multiSort)) {
    setMultiSort(next.table.multiSort);
  }
}

function commitIfChanged(prevVal, nextVal, setter) {
  if (!deepEqual(prevVal, nextVal)) setter(nextVal || {});
}
