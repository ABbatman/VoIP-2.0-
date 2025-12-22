// static/js/virtual/manager/subscriptions.js
// Responsibility: Event subscriptions for VirtualManager
import { subscribe } from '../../state/eventBus.js';
import { getExpandAllButton } from '../selectors/dom-selectors.js';
import { isRenderingInProgress } from '../../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function debounce(fn, delay = 24) {
  let tid = null;
  return (...args) => {
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => { tid = null; fn(...args); }, delay);
  };
}

function safeCall(fn, ctx) {
  try { fn?.(); } catch (e) { logError(ErrorCategory.TABLE, ctx, e); }
}

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachSubscriptions(vm) {
  const unsubs = [];

  // Y columns visibility
  const onYVisibility = () => {
    if (isRenderingInProgress()) return;
    safeCall(() => vm.syncYToggleIcons?.(), 'vmSub:yIcons');
    safeCall(() => vm.syncFloatingHeader?.(), 'vmSub:yHeader');
    safeCall(() => window.initStickyFooter?.(), 'vmSub:yFooter');
  };
  unsubs.push(subscribe('tableState:yVisibilityChanged', debounce(onYVisibility, 16)));

  // Table state changes (sorting)
  const onChanged = () => {
    if (isRenderingInProgress()) return;
    safeCall(() => vm.updateSortArrowsAfterRefresh?.(), 'vmSub:sortArrows');

    if (vm.rawData?.mainRows) {
      vm.rawData.mainRows = vm.applySortingToMainRows(vm.rawData.mainRows);
      vm.initializeLazyData?.();
      vm.refreshVirtualTable?.();
      safeCall(() => vm.processQueuedExpandCollapseAll?.(), 'vmSub:queuedExpand');
      safeCall(() => vm.syncExpandCollapseAllButtonLabel?.(), 'vmSub:syncBtn');
    }

    safeCall(() => vm.syncFloatingHeader?.(), 'vmSub:header');
  };
  unsubs.push(subscribe('tableState:changed', debounce(onChanged, 24)));

  // Reverse mode change — collapse all
  const onReverse = () => {
    if (isRenderingInProgress()) return;
    vm.openMainGroups?.clear();
    vm.openHourlyGroups?.clear();

    const btn = getExpandAllButton();
    if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
    safeCall(() => vm.syncExpandCollapseAllButtonLabel?.(), 'vmSub:reverseBtn');
    safeCall(() => vm.initializeLazyData?.(), 'vmSub:reverseLazy');
    safeCall(() => vm.refreshVirtualTable?.(), 'vmSub:reverseRefresh');
    // Force rebind toggle handlers after data refresh
    safeCall(() => vm.render?.setupDomCallbacks?.(), 'vmSub:reverseRebind');
  };
  unsubs.push(subscribe('appState:reverseModeChanged', debounce(onReverse, 24)));

  return { unsubs };
}
