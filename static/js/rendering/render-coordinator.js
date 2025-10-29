// static/js/rendering/render-coordinator.js
// Responsibility: serialize table renders (no races), de-duplicate same-kind requests in a short window

const DEFAULT_DEBOUNCE_MS = 500; // coalesce sequential triggers from different sources

class RenderCoordinator {
  constructor() {
    this._queue = [];
    this._processing = false;
    this._pendingByKind = new Map();
    this._debounceMs = DEFAULT_DEBOUNCE_MS;
    this._cooldownMsByKind = { table: 800 };
    this._lastCompletedByKind = new Map();
    this._activeKinds = new Set();
  }

  setDebounceMs(ms) { this._debounceMs = Math.max(0, Number(ms) || DEFAULT_DEBOUNCE_MS); }

  // Enqueue a render task. Task must be an async function doing the full pipeline.
  async requestRender(kind, taskFn, options = {}) {
    const now = performance.now();
    const debounceMs = options.debounceMs ?? this._debounceMs;
    const cooldownMs = options.cooldownMs ?? this._cooldownMsByKind[kind] ?? 0;

    // Cooldown: ignore if the same kind completed recently
    const lastDone = this._lastCompletedByKind.get(kind) || 0;
    if (cooldownMs && (now - lastDone) <= cooldownMs) {
      return Promise.resolve(false);
    }

    // Do NOT ignore user-driven requests while active.
    // Instead, accept the request and either replace the pending task (same kind)
    // or enqueue a new one to be executed right after the current run.

    // Replace pending task of the same kind if it's within debounce window
    const pending = this._pendingByKind.get(kind);
    if (pending && (now - pending.enqueuedAt) <= debounceMs) {
      pending.taskFn = taskFn; // replace with latest
      pending.enqueuedAt = now;
      return pending.promise;
    }

    // Create a queue item
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    const item = { kind, taskFn, enqueuedAt: now, resolve, reject, promise };

    this._pendingByKind.set(kind, item);
    this._queue.push(item);
    this._drain();
    return promise;
  }

  async _drain() {
    if (this._processing) return;
    this._processing = true;
    try {
      while (this._queue.length > 0) {
        const item = this._queue.shift();
        // If this item was replaced, pick the latest version from map
        const latest = this._pendingByKind.get(item.kind);
        if (latest && latest !== item) {
          // skip stale item; continue, the latest is still in queue
          continue;
        }
        // Execute single-flight
        try {
          // Mark global rendering in progress for table pipeline to let subscribers skip
          if (typeof window !== 'undefined' && item.kind === 'table') {
            try { window.__renderingInProgress = true; } catch(_) {
              // Ignore render coordination errors
            }
          }
          this._activeKinds.add(item.kind);
          await item.taskFn();
          item.resolve(true);
        } catch (err) {
          console.warn('[RenderCoordinator] task failed:', err);
          item.reject(err);
        } finally {
          if (typeof window !== 'undefined' && item.kind === 'table') {
            try { window.__renderingInProgress = false; } catch(_) {
              // Ignore render coordination errors
            }
          }
          this._pendingByKind.delete(item.kind);
          try { this._lastCompletedByKind.set(item.kind, performance.now()); } catch(_) {
            // Ignore render coordination errors
          }
          this._activeKinds.delete(item.kind);
        }
      }
    } finally {
      this._processing = false;
    }
  }
}

export const renderCoordinator = new RenderCoordinator();
