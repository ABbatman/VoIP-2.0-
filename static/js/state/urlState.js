// static/js/state/urlState.js
// Responsibility: URL state persistence (delegates to shortLinkState, legacy hash support)
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { getDateManuallyCommittedAt } from './runtimeFlags.js';
import { setFullState as setTableState } from './tableState.js';
import { setReverseMode, getMetricsData, updateFullState as setAppFullState } from './appState.js';
import { populateFiltersFromState } from '../dom/filter-helpers.js';
import { saveStateToShortLink, loadStateFromShortLink, hasShortLinkId, initShortLinkState } from './shortLinkState.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const HASH_PREFIX = '#state=';
const MANUAL_COMMIT_THRESHOLD_MS = 5000;
const VOLATILE_TABLE_KEYS = ['yColumnsVisible', 'multiSort'];

// ─────────────────────────────────────────────────────────────
// Helpers: Encoding (legacy hash support)
// ─────────────────────────────────────────────────────────────

function decodeState(encodedState) {
  try {
    return JSON.parse(atob(encodedState));
  } catch (e) {
    logError(ErrorCategory.STATE, 'urlState:decode', e);
    return null;
  }
}

function cleanTableState(tableState) {
  // use indexed loop instead of forEach
  for (let i = 0; i < VOLATILE_TABLE_KEYS.length; i++) {
    delete tableState[VOLATILE_TABLE_KEYS[i]];
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers: State application
// ─────────────────────────────────────────────────────────────

function applyDecodedState(state) {
  if (!state) return;

  if (state.appState) setAppFullState(state.appState);

  if (state.tableState) {
    cleanTableState(state.tableState);
    setTableState(state.tableState);
  }

  if (state.filterParams) populateFiltersFromState(state.filterParams);
  if (typeof state.isReversed === 'boolean') setReverseMode(state.isReversed);
}

function shouldSkipDueToRecentCommit() {
  const committedAt = getDateManuallyCommittedAt();
  if (!committedAt) return false;
  return (Date.now() - committedAt) < MANUAL_COMMIT_THRESHOLD_MS;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function saveStateToUrl() {
  saveStateToShortLink().catch(e => logError(ErrorCategory.STATE, 'urlState:save', e));
}

export function loadStateFromUrl() {
  // priority 1: short link (?s=ID)
  if (hasShortLinkId()) {
    loadStateFromShortLink().catch(e => logError(ErrorCategory.STATE, 'urlState:loadShortLink', e));
    return { _loadingFromShortLink: true };
  }

  // priority 2: legacy hash (#state=...)
  const hash = window.location.hash;
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null;

  const decodedState = decodeState(hash.substring(HASH_PREFIX.length));
  if (!decodedState) return null;

  // skip if data already loaded
  if (getMetricsData()) return decodedState;

  // skip if recent manual commit
  if (shouldSkipDueToRecentCommit()) return decodedState;

  applyDecodedState(decodedState);
  return decodedState;
}

export function initUrlStateSync() {
  initShortLinkState();
  window.addEventListener('popstate', loadStateFromUrl);
  window.addEventListener('hashchange', loadStateFromUrl);
}

export function clearStateFromUrl() {
  try {
    if (window.location.hash) {
      history.replaceState('', document.title, window.location.pathname + window.location.search);
    }
  } catch (e) {
    logError(ErrorCategory.STATE, 'urlState:clear', e);
  }
}

export function getCurrentUrlState() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null;
  return decodeState(hash.substring(HASH_PREFIX.length));
}

export const hasUrlState = () => hasShortLinkId() || getCurrentUrlState() !== null;
