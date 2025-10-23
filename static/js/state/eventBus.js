// static/js/state/eventBus.js
// A very simple publisher-subscriber (Pub/Sub) event bus.
// It allows different parts of the application to communicate
// without depending on each other directly.

const eventListeners = {};

/**
 * Subscribe to an event
 * @param {string} event - Event name
 * @param {Function} callback - Function to call when event occurs
 * @returns {Function} Unsubscribe function
 */
export function subscribe(event, callback) {
  if (!eventListeners[event]) {
    eventListeners[event] = [];
  }
  eventListeners[event].push(callback);
  
  return () => unsubscribe(event, callback);
}

/**
 * Publish an event to all subscribers.
 * @param {string} eventName - The name of the event to publish.
 * @param {*} [data] - Optional data to pass to the subscribers' callback functions.
 */
export function publish(eventName, data) {
  if (!eventListeners[eventName]) {
    return;
  }
  eventListeners[eventName].forEach((callback) => callback(data));
}

/**
 * Unsubscribe from a specific event.
 * @param {string} eventName - The name of the event to unsubscribe from.
 * @param {Function} callback - The callback function to remove.
 */
export function unsubscribe(eventName, callback) {
  const listeners = eventListeners[eventName];
  if (listeners) {
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }
}

/**
 * Get the number of listeners for a specific event.
 * @param {string} eventName - The name of the event.
 * @returns {number} The number of listeners.
 */
export function getListenerCount(eventName) {
  return eventListeners[eventName] ? eventListeners[eventName].length : 0;
}

/**
 * Get all registered event names.
 * @returns {string[]} Array of event names.
 */
export function getRegisteredEvents() {
  return Object.keys(eventListeners);
}

/**
 * Clear all listeners for a specific event.
 * @param {string} eventName - The name of the event.
 */
export function clearEvent(eventName) {
  if (eventListeners[eventName]) {
    delete eventListeners[eventName];
  }
}

/**
 * Clear all listeners for all events.
 */
export function clearAllEvents() {
  Object.keys(eventListeners).forEach((key) => delete eventListeners[key]);
}

/**
 * Check if an event has any listeners.
 * @param {string} eventName - The name of the event.
 * @returns {boolean} True if the event has listeners.
 */
export function hasListeners(eventName) {
  return eventListeners[eventName] && eventListeners[eventName].length > 0;
}

// Create eventBus object for backward compatibility
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
