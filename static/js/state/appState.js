// static/js/state/appState.js

import { publish } from "./eventBus.js";

const appState = {
  isReversed: false,
  metricsData: null,
  // NEW: Add a status field to track the application's global state.
  // 'idle' = waiting for user, 'loading' = fetching data, 'error' = fetch failed.
  status: "idle",
  
  // NEW: Dashboard filters and parameters
  filters: {
    customer: "",
    supplier: "",
    destination: "",
    customerGroup: "",
    supplierGroup: "",
    destinationGroup: "",
    from: "",
    to: "",
  },
  
  // NEW: Dashboard view settings
  dashboardView: {
    currentMode: "summary", // "summary" | "cdr"
    timeRange: "24h", // "1h", "6h", "24h", "7d", "30d", "custom"
    autoRefresh: false,
    refreshInterval: 30000, // 30 seconds
  },
  
  // NEW: User preferences
  preferences: {
    theme: "light", // "light" | "dark" | "auto"
    language: "en",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: "YYYY-MM-DD",
    timeFormat: "HH:mm:ss",
  },
  
  // NEW: Application settings
  settings: {
    debugMode: false,
    performanceMonitoring: false,
    showTooltips: true,
    compactMode: false,
  },

  // NEW: UI visibility flags
  ui: {
    showCharts: false,
    showModeControls: false,
    showTable: false,
  }
};

// --- GETTERS ---

export function isReverseMode() {
  return appState.isReversed;
}

export function getMetricsData() {
  return appState.metricsData;
}

export function getAppStatus() {
  // NEW: Getter for the status
  return appState.status;
}

// NEW: Filter getters
export function getFilters() {
  return { ...appState.filters };
}

export function getFilter(key) {
  return appState.filters[key] || "";
}

// NEW: Dashboard view getters
export function getDashboardView() {
  return { ...appState.dashboardView };
}

export function getCurrentMode() {
  return appState.dashboardView.currentMode;
}

export function getTimeRange() {
  return appState.dashboardView.timeRange;
}

export function isAutoRefreshEnabled() {
  return appState.dashboardView.autoRefresh;
}

// NEW: Preferences getters
export function getPreferences() {
  return { ...appState.preferences };
}

export function getTheme() {
  return appState.preferences.theme;
}

export function getTimezone() {
  return appState.preferences.timezone;
}

// NEW: Settings getters
export function getSettings() {
  return appState.settings;
}

export function isDebugMode() {
  return appState.settings.debugMode;
}

// NEW: UI getters
export function getUI() {
  return { ...appState.ui };
}
export function isChartsVisible() {
  return !!appState.ui.showCharts;
}
export function isModeControlsVisible() {
  return !!appState.ui.showModeControls;
}
export function isTableVisible() {
  return !!appState.ui.showTable;
}

// --- SETTERS ---

export function setReverseMode(isReversed) {
  appState.isReversed = isReversed;
  console.log(`🔁 Reverse mode set to: ${appState.isReversed}`);
  publish("appState:reverseModeChanged", isReversed);
}

export function setMetricsData(data) {
  appState.metricsData = data;
  publish("appState:dataChanged", data);
}

/**
 * NEW: Sets the global application status and notifies all listeners.
 * @param {'idle' | 'loading' | 'success' | 'error'} newStatus
 */
export function setAppStatus(newStatus) {
  appState.status = newStatus;
  console.log(`🔄 App status changed to: ${newStatus}`);
  publish("appState:statusChanged", newStatus);
}

// NEW: Filter setters
export function setFilters(newFilters) {
  console.log("🔍 setFilters - Current filters:", appState.filters);
  console.log("🔍 setFilters - New filters:", newFilters);
  
  Object.assign(appState.filters, newFilters);
  console.log("🔍 Filters updated:", appState.filters);
  publish("appState:filtersChanged", appState.filters);
}

export function setFilter(key, value) {
  if (Object.prototype.hasOwnProperty.call(appState.filters, key)) {
    appState.filters[key] = value;
    console.log(`🔍 Filter "${key}" set to: "${value}"`);
    publish("appState:filterChanged", { key, value });
  } else {
    console.warn(`⚠️ Unknown filter key: ${key}`);
  }
}

export function resetFilters() {
  appState.filters = {
    customer: "",
    supplier: "",
    destination: "",
    from: "",
    to: "",
  };
  console.log("🔄 Filters reset to defaults");
  publish("appState:filtersReset");
}

// NEW: Dashboard view setters
export function setDashboardView(newView) {
  Object.assign(appState.dashboardView, newView);
  console.log("📊 Dashboard view updated:", appState.dashboardView);
  publish("appState:dashboardViewChanged", appState.dashboardView);
}

export function setCurrentMode(mode) {
  if (["summary", "cdr"].includes(mode)) {
    appState.dashboardView.currentMode = mode;
    console.log(`📊 Dashboard mode changed to: ${mode}`);
    publish("appState:modeChanged", mode);
  }
}

export function setTimeRange(range) {
  if (["1h", "6h", "24h", "7d", "30d", "custom"].includes(range)) {
    appState.dashboardView.timeRange = range;
    console.log(`⏰ Time range changed to: ${range}`);
    publish("appState:timeRangeChanged", range);
  }
}

export function setAutoRefresh(enabled, interval = null) {
  appState.dashboardView.autoRefresh = enabled;
  if (interval) {
    appState.dashboardView.refreshInterval = interval;
  }
  console.log(`🔄 Auto-refresh ${enabled ? 'enabled' : 'disabled'}, interval: ${appState.dashboardView.refreshInterval}ms`);
  publish("appState:autoRefreshChanged", { enabled, interval: appState.dashboardView.refreshInterval });
}

// NEW: Preferences setters
export function setPreferences(newPreferences) {
  Object.assign(appState.preferences, newPreferences);
  console.log("⚙️ Preferences updated:", appState.preferences);
  publish("appState:preferencesChanged", appState.preferences);
}

export function setTheme(theme) {
  if (["light", "dark", "auto"].includes(theme)) {
    appState.preferences.theme = theme;
    console.log(`🎨 Theme changed to: ${theme}`);
    publish("appState:themeChanged", theme);
  }
}

export function setTimezone(timezone) {
  appState.preferences.timezone = timezone;
  console.log(`🌍 Timezone changed to: ${timezone}`);
  publish("appState:timezoneChanged", timezone);
}

// NEW: Settings setters
export function setSettings(newSettings) {
  Object.assign(appState.settings, newSettings);
  console.log("⚙️ Settings updated:", appState.settings);
  publish("appState:settingsChanged", newSettings);
}

export function setDebugMode(enabled) {
  appState.settings.debugMode = enabled;
  console.log(`🐛 Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  publish("appState:debugModeChanged", enabled);
}

// NEW: UI setters
export function setUI(updates) {
  if (!updates || typeof updates !== 'object') return;
  const prev = { ...appState.ui };
  Object.assign(appState.ui, updates);
  const next = { ...appState.ui };
  // Only publish if something actually changed
  if (prev.showCharts !== next.showCharts || prev.showModeControls !== next.showModeControls || prev.showTable !== next.showTable) {
    publish('appState:uiChanged', next);
  }
}
export function setShowCharts(visible) {
  setUI({ showCharts: !!visible });
}
export function setShowModeControls(visible) {
  setUI({ showModeControls: !!visible });
}
export function setShowTable(visible) {
  setUI({ showTable: !!visible });
}

// NEW: Utility functions
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
  if (newState && typeof newState === 'object') {
    Object.assign(appState, newState);
    // Notify state change via event bus
    publish("appState:fullStateChanged", getFullState());
  }
}
