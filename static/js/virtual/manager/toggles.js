// static/js/virtual/manager/toggles.js
// Responsibility: Toggle expand/collapse, bulk show/hide, button icon sync
import { getContainer, getExpandAllButton } from '../selectors/dom-selectors.js';
import { toggleMain, togglePeer, isMainExpanded, isPeerExpanded, closePeersUnderMain, expandAllMain, collapseAll } from '../../state/expansionState.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeCall(fn, ctx) {
  try { fn?.(); } catch (e) { logError(ErrorCategory.TABLE, ctx, e); }
}

function getVisibleData(vm) {
  return vm.selectors?.getLazyVisibleData?.() ?? vm.getLazyVisibleData();
}

function updateButton(btn, text, state) {
  if (!btn) return;
  btn.textContent = text;
  btn.dataset.state = state;
}

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachToggles(vm) {
  function closeHourlyGroupsUnderMain(mainGroupId) {
    try { return closePeersUnderMain(mainGroupId) || 0; } catch (e) { logError(ErrorCategory.TABLE, 'vmToggles:close', e); return 0; }
  }

  function syncExpandCollapseAllButtonLabel() {
    const btn = getExpandAllButton();
    if (!btn) return;
    const mainIndex = vm.lazyData?.mainIndex || [];
    const len = mainIndex.length;
    if (len === 0) return;

    // Use indexed loop with early exit instead of some()
    let anyExpanded = false;
    for (let i = 0; i < len; i++) {
      if (isMainExpanded(mainIndex[i].groupId)) {
        anyExpanded = true;
        break;
      }
    }
    updateButton(btn, anyExpanded ? 'Hide All' : 'Show All', anyExpanded ? 'shown' : 'hidden');
  }

  function processQueuedExpandCollapseAll() {
    const queued = vm._expandCollapseAllQueued;
    if (!queued || !vm.lazyData || !vm.adapter) return;
    vm._expandCollapseAllQueued = null;

    const btn = getExpandAllButton();
    // Use indexed loop instead of map
    const mainIndex = vm.lazyData.mainIndex || [];
    const len = mainIndex.length;
    const ids = [];
    for (let i = 0; i < len; i++) {
      ids.push(mainIndex[i].groupId);
    }

    if (queued === 'expand') {
      expandAllMain(ids);
      updateButton(btn, 'Hide All', 'shown');
    } else {
      collapseAll();
      updateButton(btn, 'Show All', 'hidden');
    }

    vm.adapter.setData(getVisibleData(vm));
    safeCall(() => vm.forceImmediateRender?.(), 'vmToggles:queuedRender');
    safeCall(() => vm.updateAllToggleButtons?.(), 'vmToggles:queuedBtns');
    syncExpandCollapseAllButtonLabel();
  }

  function handleVirtualToggle(event) {
    if (event.target.closest('.y-column-toggle-btn')) return;

    const toggleBtn = event.target.closest('.toggle-btn');
    if (!toggleBtn) return;

    toggleBtn.blur?.();
    event.preventDefault();
    event.stopPropagation();

    const groupId = toggleBtn.dataset.targetGroup || toggleBtn.dataset.group;
    const parentRow = toggleBtn.closest('tr');
    if (!parentRow || !groupId) return;

    if (parentRow.classList.contains('main-row')) toggleMain(groupId);
    else if (parentRow.classList.contains('peer-row')) togglePeer(groupId);

    safeCall(() => vm.refreshVirtualTable?.(), 'vmToggles:refresh');
    safeCall(() => vm.forceImmediateRender?.(), 'vmToggles:render');
    safeCall(() => vm.updateAllToggleButtons?.(), 'vmToggles:btns');
  }

  function updateAllToggleButtons() {
    // Use row pool from scroller instead of querySelectorAll
    const pool = vm.adapter?.virtualScroller?._rowPool;
    if (!pool || !pool.length) {
      // Fallback to container query only if no pool
      const container = getContainer();
      if (!container) return;
      updateToggleButtonsInContainer(container);
      vm._lastStructuralChange = false;
      return;
    }

    // Iterate pool directly — O(visible) instead of O(DOM)
    const len = pool.length;
    for (let i = 0; i < len; i++) {
      const tr = pool[i];
      if (!tr.parentNode) continue; // not attached

      const btn = tr.querySelector('.toggle-btn');
      if (!btn) continue;

      const groupId = btn.dataset.targetGroup || btn.dataset.group;
      if (!groupId) continue;

      const isMain = tr.classList.contains('main-row');
      const expanded = isMain ? isMainExpanded(groupId) : isPeerExpanded(groupId);
      const text = expanded ? '−' : '+';
      if (btn.textContent !== text) btn.textContent = text;
    }

    vm._lastStructuralChange = false;
  }

  // Fallback for when pool is not available
  function updateToggleButtonsInContainer(container) {
    const buttons = container.querySelectorAll('.toggle-btn');
    const len = buttons.length;
    for (let i = 0; i < len; i++) {
      const btn = buttons[i];
      const groupId = btn.dataset.targetGroup || btn.dataset.group;
      if (!groupId) continue;

      const tr = btn.closest('tr');
      if (!tr) continue;

      const isMain = tr.classList.contains('main-row');
      const expanded = isMain ? isMainExpanded(groupId) : isPeerExpanded(groupId);
      const text = expanded ? '−' : '+';
      if (btn.textContent !== text) btn.textContent = text;
    }
  }

  function showAllRows() {
    if (!vm.isActive || !vm.lazyData || !vm.adapter) return;

    // Use indexed loop instead of map
    const mainIndex = vm.lazyData.mainIndex || [];
    const len = mainIndex.length;
    const ids = [];
    for (let i = 0; i < len; i++) {
      ids.push(mainIndex[i].groupId);
    }
    expandAllMain(ids);

    vm._lastStructuralChange = true;
    vm.adapter.setData(getVisibleData(vm));

    safeCall(() => vm.forceImmediateRender?.(), 'vmToggles:showRender');
    safeCall(() => vm.updateAllToggleButtons?.(), 'vmToggles:showBtns');
    safeCall(() => vm.syncButtonStatesAfterRender?.(), 'vmToggles:showSync');

    updateButton(getExpandAllButton(), 'Hide All', 'shown');
    syncExpandCollapseAllButtonLabel();
  }

  function hideAllRows() {
    if (!vm.isActive || !vm.lazyData || !vm.adapter) return;

    collapseAll();

    vm._lastStructuralChange = true;
    vm.adapter.setData(getVisibleData(vm));

    safeCall(() => vm.forceImmediateRender?.(), 'vmToggles:hideRender');
    safeCall(() => vm.updateAllToggleButtons?.(), 'vmToggles:hideBtns');
    safeCall(() => vm.syncButtonStatesAfterRender?.(), 'vmToggles:hideSync');

    updateButton(getExpandAllButton(), 'Show All', 'hidden');
    syncExpandCollapseAllButtonLabel();
  }

  return { handleVirtualToggle, updateAllToggleButtons, showAllRows, hideAllRows, closeHourlyGroupsUnderMain, processQueuedExpandCollapseAll, syncExpandCollapseAllButtonLabel };
}
