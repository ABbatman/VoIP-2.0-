// static/js/state/eventBus.js
// A very simple publisher-subscriber (Pub/Sub) event bus.
// It allows different parts of the application to communicate
// without depending on each other directly.

const listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string} eventName - The name of the event to listen for.
 * @param {Function} callback - The function to execute when the event is published.
 */
export function subscribe(eventName, callback) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, []);
  }
  listeners.get(eventName).push(callback);
  console.log(`[EventBus] New subscription to "${eventName}"`);
}

/**
 * Publish an event to all subscribers.
 * @param {string} eventName - The name of the event to publish.
 * @param {*} [data] - Optional data to pass to the subscribers' callback functions.
 */
export function publish(eventName, data) {
  if (!listeners.has(eventName)) {
    return;
  }
  console.log(`[EventBus] Publishing event "${eventName}"`, data || "");
  listeners.get(eventName).forEach((callback) => callback(data));
}
