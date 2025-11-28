// static/js/virtual/manager/subscriptions.js
// Layer: central subscriptions wiring for VirtualManager

import { subscribe } from '../../state/eventBus.js';
import { getExpandAllButton } from '../selectors/dom-selectors.js';
import { isRenderingInProgress } from '../../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// Export a reusable debounce for future signals
export function debounce(fn, delay = 24) {
  let tid = null;
  return (...args) => {
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => { tid = null; fn(...args); }, delay);
  };
}

export function attachSubscriptions(vm) {
  const unsubs = [];

  // Y columns visibility changes
  const onYVisibility = () => {
    if (isRenderingInProgress()) return;
    try { vm.syncYToggleIcons && vm.syncYToggleIcons(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try { vm.syncFloatingHeader && vm.syncFloatingHeader(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try { if (window.initStickyFooter) window.initStickyFooter(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
  };
  const unsubY = subscribe('tableState:yVisibilityChanged', debounce(onYVisibility, 16));
  unsubs.push(unsubY);

  // Table state changes (e.g. sorting) — keep groups as-is, rebuild indices and refresh
  const onChanged = () => {
    if (isRenderingInProgress()) return;
    try { vm.updateSortArrowsAfterRefresh && vm.updateSortArrowsAfterRefresh(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try {
      if (vm.rawData && Array.isArray(vm.rawData.mainRows)) {
        const sortedMainRows = vm.applySortingToMainRows(vm.rawData.mainRows);
        vm.rawData.mainRows = sortedMainRows;
        vm.initializeLazyData();
        vm.refreshVirtualTable();
        try { vm.processQueuedExpandCollapseAll && vm.processQueuedExpandCollapseAll(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
        try { vm.syncExpandCollapseAllButtonLabel && vm.syncExpandCollapseAllButtonLabel(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
      }
    } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try { vm.syncFloatingHeader && vm.syncFloatingHeader(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
  };
  const debouncedChanged = debounce(onChanged, 24);
  const unsubChanged = subscribe('tableState:changed', debouncedChanged);
  unsubs.push(unsubChanged);

  // Reverse mode change — collapse all and reset button
  const onReverse = () => {
    if (isRenderingInProgress()) return;
    try { vm.openMainGroups && vm.openMainGroups.clear(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try { vm.openHourlyGroups && vm.openHourlyGroups.clear(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try {
      const btn = getExpandAllButton();
      if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
      vm.syncExpandCollapseAllButtonLabel && vm.syncExpandCollapseAllButtonLabel();
    } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try { vm.initializeLazyData && vm.initializeLazyData(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
    try { vm.refreshVirtualTable && vm.refreshVirtualTable(); } catch (e) { logError(ErrorCategory.TABLE, 'vmSubscriptions', e); }
  };
  const unsubReverse = subscribe('appState:reverseModeChanged', debounce(onReverse, 24));
  unsubs.push(unsubReverse);

  return { unsubs };
}
