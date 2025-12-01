// static/js/virtual/manager/events.js
// Responsibility: Bind/unbind DOM event handlers for VirtualManager
import { getContainer, getTbody, getExpandAllButton } from '../selectors/dom-selectors.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeRemove(el, event, handler) {
  try { el?.removeEventListener(event, handler); } catch (e) { logError(ErrorCategory.UI, 'vmEvents:safeRemove', e); }
}

function safeCall(fn, ctx) {
  try { fn?.(); } catch (e) { logError(ErrorCategory.UI, ctx, e); }
}

function detectColumnFromCell(td) {
  if (td.dataset.filterColumn) return td.dataset.filterColumn;
  if (td.classList.contains('main-cell') && !td.classList.contains('hour-datetime')) return 'main';
  if (td.classList.contains('peer-cell')) return 'peer';
  if (td.classList.contains('destination-cell')) return 'destination';
  if (td.classList.contains('hour-datetime')) return 'date';
  return null;
}

function getCellFilterValue(td) {
  return (td.getAttribute('data-filter-value') || td.getAttribute('data-full-text') || td.textContent || '').trim();
}

// ─────────────────────────────────────────────────────────────
// Toggle handlers (click)
// ─────────────────────────────────────────────────────────────

export function bindToggleHandlers(vm) {
  if (!getContainer()) return;
  const tbody = getTbody();
  if (!tbody) return;

  // already bound to same element
  if (vm._toggleBound && vm._toggleBoundElement === tbody && vm.boundToggleHandler) return;

  // unbind from old element
  if (vm._toggleBound && vm._toggleBoundElement !== tbody) {
    safeRemove(vm._toggleBoundElement, 'click', vm.boundToggleHandler);
  }

  vm.boundToggleHandler ??= event => {
    safeCall(() => vm.toggles?.handleVirtualToggle?.(event), 'vmEvents:toggle');
  };

  tbody.addEventListener('click', vm.boundToggleHandler);
  vm._toggleBound = true;
  vm._toggleBoundElement = tbody;
}

export function unbindToggleHandlers(vm) {
  if (vm._toggleBound && vm._toggleBoundElement && vm.boundToggleHandler) {
    safeRemove(vm._toggleBoundElement, 'click', vm.boundToggleHandler);
  }
  vm._toggleBound = false;
  vm._toggleBoundElement = null;
  vm.boundToggleHandler = null;
}

// ─────────────────────────────────────────────────────────────
// Double-click filter handlers
// ─────────────────────────────────────────────────────────────

export function bindDblClickHandlers(vm) {
  const tbody = getTbody();
  if (!tbody) return;

  if (vm._dblFilterBound && vm._dblFilterElement === tbody && vm.boundDblFilterHandler) return;

  if (vm._dblFilterBound && vm._dblFilterElement !== tbody) {
    safeRemove(vm._dblFilterElement, 'dblclick', vm.boundDblFilterHandler);
  }

  vm.boundDblFilterHandler ??= event => {
    try {
      if (event.target.closest('.toggle-btn')) return;
      const td = event.target.closest('td');
      if (!td) return;

      const column = detectColumnFromCell(td);
      const value = getCellFilterValue(td);
      if (!column || !value) return;

      // try global handler first
      let handled = false;
      if (typeof window.applyFooterFilter === 'function') {
        try { window.applyFooterFilter(column, value, { append: true }); handled = true; } catch (e) { logError(ErrorCategory.UI, 'vmEvents:dblclick', e); }
      }

      // fallback to custom event
      if (!handled) {
        document.dispatchEvent(new CustomEvent('table:applyFooterFilter', { detail: { column, value, append: true } }));
      }

      event.preventDefault();
      event.stopPropagation();
    } catch (e) {
      logError(ErrorCategory.UI, 'vmEvents:dblclick', e);
    }
  };

  tbody.addEventListener('dblclick', vm.boundDblFilterHandler);
  vm._dblFilterBound = true;
  vm._dblFilterElement = tbody;
}

export function unbindDblClickHandlers(vm) {
  if (vm._dblFilterBound && vm._dblFilterElement && vm.boundDblFilterHandler) {
    safeRemove(vm._dblFilterElement, 'dblclick', vm.boundDblFilterHandler);
  }
  vm._dblFilterBound = false;
  vm._dblFilterElement = null;
  vm.boundDblFilterHandler = null;
}

// ─────────────────────────────────────────────────────────────
// Expand/Collapse All
// ─────────────────────────────────────────────────────────────

export function bindExpandCollapseAll(vm) {
  const btn = getExpandAllButton();
  if (!btn) return;

  if (vm._expandAllBound && vm._expandAllElement === btn && vm.boundExpandAllHandler) return;

  if (vm._expandAllBound && vm._expandAllElement !== btn) {
    safeRemove(vm._expandAllElement, 'click', vm.boundExpandAllHandler);
  }

  vm.boundExpandAllHandler ??= async () => {
    try {
      const state = btn.dataset.state || 'hidden';

      if (!vm.lazyData || !vm.adapter) {
        vm._expandCollapseAllQueued = state === 'hidden' ? 'expand' : 'collapse';
        return;
      }

      btn.disabled = true;

      if (state === 'hidden') {
        vm.showAllRows?.();
        btn.textContent = 'Hide All';
        btn.dataset.state = 'shown';
      } else {
        vm.hideAllRows?.();
        btn.textContent = 'Show All';
        btn.dataset.state = 'hidden';
      }

      safeCall(() => vm.updateAllToggleButtons?.(), 'vmEvents:updateToggles');
      safeCall(() => vm.syncExpandCollapseAllButton?.(vm), 'vmEvents:syncBtn');
    } finally {
      btn.disabled = false;
    }
  };

  btn.addEventListener('click', vm.boundExpandAllHandler);
  vm._expandAllBound = true;
  vm._expandAllElement = btn;
}

export function unbindExpandCollapseAll(vm) {
  if (vm._expandAllBound && vm._expandAllElement && vm.boundExpandAllHandler) {
    safeRemove(vm._expandAllElement, 'click', vm.boundExpandAllHandler);
  }
  vm._expandAllBound = false;
  vm._expandAllElement = null;
  vm.boundExpandAllHandler = null;
}

// ─────────────────────────────────────────────────────────────
// Sync button state
// ─────────────────────────────────────────────────────────────

export function syncExpandCollapseAllButton(vm) {
  const btn = getExpandAllButton();
  if (!btn) return;

  const anyOpen = vm?.openMainGroups?.size > 0;
  const [text, state] = anyOpen ? ['Hide All', 'shown'] : ['Show All', 'hidden'];

  if (btn.textContent !== text) btn.textContent = text;
  if (btn.dataset.state !== state) btn.dataset.state = state;
}
