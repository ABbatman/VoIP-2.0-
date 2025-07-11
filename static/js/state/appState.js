// static/js/state/appState.js

import { publish } from "./eventBus.js";

const appState = {
  isReversed: false,
  metricsData: null,
  // NEW: Add a status field to track the application's global state.
  // 'idle' = waiting for user, 'loading' = fetching data, 'error' = fetch failed.
  status: "idle",
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
