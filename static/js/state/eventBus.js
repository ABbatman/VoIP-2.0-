// static/js/state/eventBus.js
// Responsibility: Pub/Sub event bus for decoupled communication

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const listeners = {};

// ─────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────

export function subscribe(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
  return () => unsubscribe(event, callback);
}

export function publish(event, data) {
  listeners[event]?.forEach(cb => cb(data));
}

export function unsubscribe(event, callback) {
  const list = listeners[event];
  if (!list) return;

  const idx = list.indexOf(callback);
  if (idx > -1) list.splice(idx, 1);
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

export const getListenerCount = event => listeners[event]?.length ?? 0;
export const getRegisteredEvents = () => Object.keys(listeners);
export const hasListeners = event => (listeners[event]?.length ?? 0) > 0;

export function clearEvent(event) {
  delete listeners[event];
}

export function clearAllEvents() {
  Object.keys(listeners).forEach(key => delete listeners[key]);
}

// ─────────────────────────────────────────────────────────────
// Compat object export
// ─────────────────────────────────────────────────────────────

export const eventBus = {
  subscribe,
  publish,
  unsubscribe,
  getListenerCount,
  getRegisteredEvents,
  clearEvent,
  clearAllEvents,
  hasListeners
};
