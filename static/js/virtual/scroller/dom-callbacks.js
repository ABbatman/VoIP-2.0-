// static/js/virtual/scroller/dom-callbacks.js
// Responsibility: DOM update callback dispatch for VirtualScroller
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const FRAME_BUDGET_MS = 16;
const DEFAULT_TICK_INTERVAL = 3;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function maybeNotifyDomUpdate(vm, { forceRender = false, structuralChange = false } = {}) {
  if (!vm || typeof vm.onDOMUpdate !== 'function') return;

  vm._domTick = (vm._domTick || 0) + 1;
  vm._lastStructuralChange = !!structuralChange;

  const tickInterval = vm._domEvery || DEFAULT_TICK_INTERVAL;
  const shouldNotify = forceRender || structuralChange || (vm._domTick % tickInterval === 0);

  if (!shouldNotify) return;

  try {
    const t1 = performance.now();
    vm.onDOMUpdate();
    const dur = performance.now() - t1;

    if (window.DEBUG && dur > FRAME_BUDGET_MS) {
      logError(ErrorCategory.RENDER, 'domCallbacks:budget', `${Math.round(dur)}ms (>${FRAME_BUDGET_MS}ms)`);
    }
  } catch (e) {
    logError(ErrorCategory.RENDER, 'domCallbacks', e);
  }
}
