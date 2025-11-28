// static/js/state/runtimeFlags.js
// Centralized runtime flags to replace window.* pollution
// All flags are module-scoped, accessed via getters/setters

const _flags = {
  // Chart zoom range
  chartsZoomRange: null,        // { fromTs, toTs } | null
  
  // Rendering coordination
  renderingInProgress: false,
  
  // Find operation
  isManualFindInProgress: false,
  
  // Chart interval
  chartsCurrentInterval: '1h',
  
  // Table visibility
  hideTableUntilSummary: false,
  
  // Fetch guards
  summaryFetchInProgress: false,
  intervalFetchInFlight: false,
  
  // Delegation flags
  summaryDelegationInstalled: false,
  chartsIntervalFetchSubscribed: false,
  
  // Charts render request
  chartsRenderRequested: false,
};

// --- Charts Zoom Range ---
export function getChartsZoomRange() {
  return _flags.chartsZoomRange;
}

export function setChartsZoomRange(range) {
  if (range && Number.isFinite(range.fromTs) && Number.isFinite(range.toTs)) {
    _flags.chartsZoomRange = { fromTs: Number(range.fromTs), toTs: Number(range.toTs) };
  } else {
    _flags.chartsZoomRange = null;
  }
}

export function clearChartsZoomRange() {
  _flags.chartsZoomRange = null;
}

// --- Rendering In Progress ---
export function isRenderingInProgress() {
  return _flags.renderingInProgress;
}

export function setRenderingInProgress(val) {
  _flags.renderingInProgress = !!val;
}

// --- Manual Find In Progress ---
export function isManualFindInProgress() {
  return _flags.isManualFindInProgress;
}

export function setManualFindInProgress(val) {
  _flags.isManualFindInProgress = !!val;
}

// --- Charts Current Interval ---
export function getChartsCurrentInterval() {
  return _flags.chartsCurrentInterval || '1h';
}

export function setChartsCurrentInterval(val) {
  _flags.chartsCurrentInterval = val || '1h';
}

// --- Hide Table Until Summary ---
export function shouldHideTableUntilSummary() {
  return _flags.hideTableUntilSummary;
}

export function setHideTableUntilSummary(val) {
  _flags.hideTableUntilSummary = !!val;
}

// --- Summary Fetch In Progress ---
export function isSummaryFetchInProgress() {
  return _flags.summaryFetchInProgress;
}

export function setSummaryFetchInProgress(val) {
  _flags.summaryFetchInProgress = !!val;
}

// --- Interval Fetch In Flight ---
export function isIntervalFetchInFlight() {
  return _flags.intervalFetchInFlight;
}

export function setIntervalFetchInFlight(val) {
  _flags.intervalFetchInFlight = !!val;
}

// --- Delegation Installed Flags ---
export function isSummaryDelegationInstalled() {
  return _flags.summaryDelegationInstalled;
}

export function setSummaryDelegationInstalled(val) {
  _flags.summaryDelegationInstalled = !!val;
}

export function isChartsIntervalFetchSubscribed() {
  return _flags.chartsIntervalFetchSubscribed;
}

export function setChartsIntervalFetchSubscribed(val) {
  _flags.chartsIntervalFetchSubscribed = !!val;
}

// --- Charts Render Requested ---
export function isChartsRenderRequested() {
  return _flags.chartsRenderRequested;
}

export function setChartsRenderRequested(val) {
  _flags.chartsRenderRequested = !!val;
}
