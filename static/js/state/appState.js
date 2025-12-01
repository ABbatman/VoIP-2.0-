// static/js/state/appState.js
// Responsibility: Global application state management
import { publish } from './eventBus.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VALID_MODES = ['summary', 'cdr'];
const VALID_TIME_RANGES = ['1h', '6h', '24h', '7d', '30d', 'custom'];
const VALID_THEMES = ['light', 'dark', 'auto'];

const DEFAULT_FILTERS = {
  customer: '',
  supplier: '',
  destination: '',
  customerGroup: '',
  supplierGroup: '',
  destinationGroup: '',
  from: '',
  to: ''
};

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const appState = {
  isReversed: false,
  metricsData: null,
  status: 'idle',

  filters: { ...DEFAULT_FILTERS },

  dashboardView: {
    currentMode: 'summary',
    timeRange: '24h',
    autoRefresh: false,
    refreshInterval: 30000
  },

  preferences: {
    theme: 'light',
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss'
  },

  settings: {
    debugMode: false,
    performanceMonitoring: false,
    showTooltips: true,
    compactMode: false
  },

  ui: {
    showCharts: false,
    showModeControls: false,
    showTable: false
  }
};

// ─────────────────────────────────────────────────────────────
// Getters: Core
// ─────────────────────────────────────────────────────────────

export const isReverseMode = () => appState.isReversed;
export const getMetricsData = () => appState.metricsData;
export const getAppStatus = () => appState.status;

// ─────────────────────────────────────────────────────────────
// Getters: Filters
// ─────────────────────────────────────────────────────────────

export const getFilters = () => ({ ...appState.filters });
export const getFilter = key => appState.filters[key] || '';

// ─────────────────────────────────────────────────────────────
// Getters: Dashboard view
// ─────────────────────────────────────────────────────────────

export const getDashboardView = () => ({ ...appState.dashboardView });
export const getCurrentMode = () => appState.dashboardView.currentMode;
export const getTimeRange = () => appState.dashboardView.timeRange;
export const isAutoRefreshEnabled = () => appState.dashboardView.autoRefresh;

// ─────────────────────────────────────────────────────────────
// Getters: Preferences
// ─────────────────────────────────────────────────────────────

export const getPreferences = () => ({ ...appState.preferences });
export const getTheme = () => appState.preferences.theme;
export const getTimezone = () => appState.preferences.timezone;

// ─────────────────────────────────────────────────────────────
// Getters: Settings
// ─────────────────────────────────────────────────────────────

export const getSettings = () => appState.settings;
export const isDebugMode = () => appState.settings.debugMode;

// ─────────────────────────────────────────────────────────────
// Getters: UI
// ─────────────────────────────────────────────────────────────

export const getUI = () => ({ ...appState.ui });
export const isChartsVisible = () => !!appState.ui.showCharts;
export const isModeControlsVisible = () => !!appState.ui.showModeControls;
export const isTableVisible = () => !!appState.ui.showTable;

// ─────────────────────────────────────────────────────────────
// Setters: Core
// ─────────────────────────────────────────────────────────────

export function setReverseMode(isReversed) {
  appState.isReversed = isReversed;
  publish('appState:reverseModeChanged', isReversed);
}

export function setMetricsData(data) {
  appState.metricsData = data;
  publish('appState:dataChanged', data);
}

export function setAppStatus(newStatus) {
  appState.status = newStatus;
  publish('appState:statusChanged', newStatus);
}

// ─────────────────────────────────────────────────────────────
// Setters: Filters
// ─────────────────────────────────────────────────────────────

export function setFilters(newFilters) {
  Object.assign(appState.filters, newFilters);
  publish('appState:filtersChanged', appState.filters);
}

export function setFilter(key, value) {
  if (!(key in appState.filters)) return;
  appState.filters[key] = value;
  publish('appState:filterChanged', { key, value });
}

export function resetFilters() {
  appState.filters = { ...DEFAULT_FILTERS };
  publish('appState:filtersReset');
}

// ─────────────────────────────────────────────────────────────
// Setters: Dashboard view
// ─────────────────────────────────────────────────────────────

export function setDashboardView(newView) {
  Object.assign(appState.dashboardView, newView);
  publish('appState:dashboardViewChanged', appState.dashboardView);
}

export function setCurrentMode(mode) {
  if (!VALID_MODES.includes(mode)) return;
  appState.dashboardView.currentMode = mode;
  publish('appState:modeChanged', mode);
}

export function setTimeRange(range) {
  if (!VALID_TIME_RANGES.includes(range)) return;
  appState.dashboardView.timeRange = range;
  publish('appState:timeRangeChanged', range);
}

export function setAutoRefresh(enabled, interval = null) {
  appState.dashboardView.autoRefresh = enabled;
  if (interval) appState.dashboardView.refreshInterval = interval;
  publish('appState:autoRefreshChanged', {
    enabled,
    interval: appState.dashboardView.refreshInterval
  });
}

// ─────────────────────────────────────────────────────────────
// Setters: Preferences
// ─────────────────────────────────────────────────────────────

export function setPreferences(newPreferences) {
  Object.assign(appState.preferences, newPreferences);
  publish('appState:preferencesChanged', appState.preferences);
}

export function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) return;
  appState.preferences.theme = theme;
  publish('appState:themeChanged', theme);
}

export function setTimezone(timezone) {
  appState.preferences.timezone = timezone;
  publish('appState:timezoneChanged', timezone);
}

// ─────────────────────────────────────────────────────────────
// Setters: Settings
// ─────────────────────────────────────────────────────────────

export function setSettings(newSettings) {
  Object.assign(appState.settings, newSettings);
  publish('appState:settingsChanged', newSettings);
}

export function setDebugMode(enabled) {
  appState.settings.debugMode = enabled;
  publish('appState:debugModeChanged', enabled);
}

// ─────────────────────────────────────────────────────────────
// Setters: UI
// ─────────────────────────────────────────────────────────────

export function setUI(updates) {
  if (!updates || typeof updates !== 'object') return;

  const prev = { ...appState.ui };
  Object.assign(appState.ui, updates);

  const changed = Object.keys(updates).some(k => prev[k] !== appState.ui[k]);
  if (changed) publish('appState:uiChanged', { ...appState.ui });
}

export const setShowCharts = visible => setUI({ showCharts: !!visible });
export const setShowModeControls = visible => setUI({ showModeControls: !!visible });
export const setShowTable = visible => setUI({ showTable: !!visible });

// ─────────────────────────────────────────────────────────────
// Full state utilities
// ─────────────────────────────────────────────────────────────

export function getFullState() {
  return {
    isReversed: appState.isReversed,
    status: appState.status,
    filters: { ...appState.filters },
    dashboardView: { ...appState.dashboardView },
    preferences: { ...appState.preferences },
    settings: { ...appState.settings },
    ui: { ...appState.ui }
  };
}

export function updateFullState(newState) {
  if (!newState || typeof newState !== 'object') return;
  Object.assign(appState, newState);
  publish('appState:fullStateChanged', getFullState());
}
