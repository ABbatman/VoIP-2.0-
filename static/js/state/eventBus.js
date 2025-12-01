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
  const list = listeners[event];
  if (!list) return;
  // use indexed loop for better performance
  const len = list.length;
  for (let i = 0; i < len; i++) {
    list[i](data);
  }
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
  // use for-in instead of Object.keys().forEach()
  for (const key in listeners) {
    delete listeners[key];
  }
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
