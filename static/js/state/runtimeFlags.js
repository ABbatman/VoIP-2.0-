// static/js/state/runtimeFlags.js
// Responsibility: Centralized runtime flags (replaces window.* pollution)

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const flags = {
  // charts
  chartsZoomRange: null,
  chartsCurrentInterval: '1h',
  chartsRenderRequested: false,
  chartsUsedZoomForLastFetch: false,
  chartsBarPerProvider: false,
  chartsLastFilters: null,
  chartsInitDone: false,
  chartsIntervalFetchSubscribed: false,

  // rendering
  renderingInProgress: false,

  // fetch guards
  isManualFindInProgress: false,
  summaryFetchInProgress: false,
  intervalFetchInFlight: false,
  summaryDelegationInstalled: false,

  // table
  hideTableUntilSummary: false,
  tableNeedsRebuild: false,

  // UI
  dateManuallyCommittedAt: null,
  pendingFilterFocus: null
};

// ─────────────────────────────────────────────────────────────
// Generic accessors
// ─────────────────────────────────────────────────────────────

const getBool = key => flags[key];
const setBool = (key, val) => { flags[key] = !!val; };
const getVal = key => flags[key];
const setVal = (key, val) => { flags[key] = val; };

// ─────────────────────────────────────────────────────────────
// Charts: Zoom Range
// ─────────────────────────────────────────────────────────────

export const getChartsZoomRange = () => flags.chartsZoomRange;

export function setChartsZoomRange(range) {
  if (range && Number.isFinite(range.fromTs) && Number.isFinite(range.toTs)) {
    flags.chartsZoomRange = { fromTs: Number(range.fromTs), toTs: Number(range.toTs) };
  } else {
    flags.chartsZoomRange = null;
  }
}

export const clearChartsZoomRange = () => { flags.chartsZoomRange = null; };

// ─────────────────────────────────────────────────────────────
// Charts: Interval & Filters
// ─────────────────────────────────────────────────────────────

export const getChartsCurrentInterval = () => flags.chartsCurrentInterval || '1h';
export const setChartsCurrentInterval = val => { flags.chartsCurrentInterval = val || '1h'; };

export const getChartsLastFilters = () => flags.chartsLastFilters;
export const setChartsLastFilters = filters => { flags.chartsLastFilters = filters; };

// ─────────────────────────────────────────────────────────────
// Charts: Boolean flags
// ─────────────────────────────────────────────────────────────

export const isChartsRenderRequested = () => getBool('chartsRenderRequested');
export const setChartsRenderRequested = val => setBool('chartsRenderRequested', val);

export const getChartsUsedZoomForLastFetch = () => getBool('chartsUsedZoomForLastFetch');
export const setChartsUsedZoomForLastFetch = val => setBool('chartsUsedZoomForLastFetch', val);

export const isChartsBarPerProvider = () => getBool('chartsBarPerProvider');
export const setChartsBarPerProvider = val => setBool('chartsBarPerProvider', val);

export const isChartsInitDone = () => getBool('chartsInitDone');
export const setChartsInitDone = val => setBool('chartsInitDone', val);

export const isChartsIntervalFetchSubscribed = () => getBool('chartsIntervalFetchSubscribed');
export const setChartsIntervalFetchSubscribed = val => setBool('chartsIntervalFetchSubscribed', val);

// ─────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────

export const isRenderingInProgress = () => getBool('renderingInProgress');
export const setRenderingInProgress = val => setBool('renderingInProgress', val);

// ─────────────────────────────────────────────────────────────
// Fetch guards
// ─────────────────────────────────────────────────────────────

export const isManualFindInProgress = () => getBool('isManualFindInProgress');
export const setManualFindInProgress = val => setBool('isManualFindInProgress', val);

export const isSummaryFetchInProgress = () => getBool('summaryFetchInProgress');
export const setSummaryFetchInProgress = val => setBool('summaryFetchInProgress', val);

export const isIntervalFetchInFlight = () => getBool('intervalFetchInFlight');
export const setIntervalFetchInFlight = val => setBool('intervalFetchInFlight', val);

export const isSummaryDelegationInstalled = () => getBool('summaryDelegationInstalled');
export const setSummaryDelegationInstalled = val => setBool('summaryDelegationInstalled', val);

// ─────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────

export const shouldHideTableUntilSummary = () => getBool('hideTableUntilSummary');
export const setHideTableUntilSummary = val => setBool('hideTableUntilSummary', val);

export const isTableNeedsRebuild = () => getBool('tableNeedsRebuild');
export const setTableNeedsRebuild = val => setBool('tableNeedsRebuild', val);

// ─────────────────────────────────────────────────────────────
// UI: Date picker
// ─────────────────────────────────────────────────────────────

export const getDateManuallyCommittedAt = () => getVal('dateManuallyCommittedAt');
export const setDateManuallyCommittedAt = ts => setVal('dateManuallyCommittedAt', ts);

// ─────────────────────────────────────────────────────────────
// UI: Filter focus
// ─────────────────────────────────────────────────────────────

export const getPendingFilterFocus = () => flags.pendingFilterFocus;
export const setPendingFilterFocus = focus => { flags.pendingFilterFocus = focus; };
export const clearPendingFilterFocus = () => { flags.pendingFilterFocus = null; };
