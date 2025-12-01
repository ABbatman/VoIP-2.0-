// static/js/rendering/render-coordinator.js
// Responsibility: Serialize renders, debounce, prevent races
import { setRenderingInProgress } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_COOLDOWNS = { table: 800 };

// ─────────────────────────────────────────────────────────────
// RenderCoordinator class
// ─────────────────────────────────────────────────────────────

class RenderCoordinator {
  constructor() {
    this._queue = [];
    this._processing = false;
    this._pendingByKind = new Map();
    this._debounceMs = DEFAULT_DEBOUNCE_MS;
    this._cooldownMsByKind = { ...DEFAULT_COOLDOWNS };
    this._lastCompletedByKind = new Map();
    this._activeKinds = new Set();
  }

  setDebounceMs(ms) {
    this._debounceMs = Math.max(0, Number(ms) || DEFAULT_DEBOUNCE_MS);
  }

  async requestRender(kind, taskFn, options = {}) {
    const now = performance.now();
    const debounceMs = options.debounceMs ?? this._debounceMs;
    const cooldownMs = options.cooldownMs ?? this._cooldownMsByKind[kind] ?? 0;

    // skip if same kind completed recently
    const lastDone = this._lastCompletedByKind.get(kind) || 0;
    if (cooldownMs && (now - lastDone) <= cooldownMs) {
      return false;
    }

    // replace pending task within debounce window
    const pending = this._pendingByKind.get(kind);
    if (pending && (now - pending.enqueuedAt) <= debounceMs) {
      pending.taskFn = taskFn;
      pending.enqueuedAt = now;
      return pending.promise;
    }

    // create queue item
    const item = this._createQueueItem(kind, taskFn, now);
    this._pendingByKind.set(kind, item);
    this._queue.push(item);
    this._drain();

    return item.promise;
  }

  _createQueueItem(kind, taskFn, enqueuedAt) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { kind, taskFn, enqueuedAt, resolve, reject, promise };
  }

  async _drain() {
    if (this._processing) return;
    this._processing = true;

    try {
      while (this._queue.length > 0) {
        const item = this._queue.shift();

        // skip stale items
        const latest = this._pendingByKind.get(item.kind);
        if (latest && latest !== item) continue;

        await this._executeItem(item);
      }
    } finally {
      this._processing = false;
    }
  }

  async _executeItem(item) {
    const isTable = item.kind === 'table';

    try {
      if (isTable) setRenderingInProgress(true);
      this._activeKinds.add(item.kind);

      await item.taskFn();
      item.resolve(true);
    } catch (err) {
      item.reject(err);
    } finally {
      if (isTable) setRenderingInProgress(false);
      this._pendingByKind.delete(item.kind);
      this._lastCompletedByKind.set(item.kind, performance.now());
      this._activeKinds.delete(item.kind);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Export singleton
// ─────────────────────────────────────────────────────────────

export const renderCoordinator = new RenderCoordinator();
