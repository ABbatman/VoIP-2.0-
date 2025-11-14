// static/js/virtual/manager/toggles.js
// Layer: toggles (expand/collapse, bulk show/hide, button icons sync)
import { getContainer, getExpandAllButton } from '../selectors/dom-selectors.js';
import {
  toggleMain,
  togglePeer,
  isMainExpanded,
  isPeerExpanded,
  closePeersUnderMain as collapsePeersUnderMain,
  expandAllMain,
  collapseAll,
} from '../../state/expansionState.js';

export function attachToggles(vm) {
  function closeHourlyGroupsUnderMain(mainGroupId) {
    // Delegate to centralized state; returns number collapsed (we can't know easily, return 0/NaN)
    try { return collapsePeersUnderMain(mainGroupId) || 0; } catch (_) { return 0; }
  }

  function processQueuedExpandCollapseAll() {
    const btn = getExpandAllButton();
    const queued = vm._expandCollapseAllQueued;
    if (!queued) return;
    vm._expandCollapseAllQueued = null;
    if (!vm.lazyData || !vm.adapter) return;
    try {
      if (queued === 'expand') {
        const ids = (vm.lazyData?.mainIndex || []).map(m => m.groupId);
        expandAllMain(ids);
        const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
        vm.adapter.setData(visible);
        try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {}
        if (btn) { btn.textContent = 'Hide All'; btn.dataset.state = 'shown'; }
      } else if (queued === 'collapse') {
        collapseAll();
        const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
        vm.adapter.setData(visible);
        try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {}
        if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
      }
      try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (e) {
        console.error('Error updating toggle buttons:', e);
      }
      try { vm.syncExpandCollapseAllButtonLabel && vm.syncExpandCollapseAllButtonLabel(); } catch (e) {
        console.error('Error syncing expand/collapse all button label:', e);
      }
    } catch (e) {
      console.warn('processQueuedExpandCollapseAll failed', e);
    }
  }

  function handleVirtualToggle(event) {
    try {
      // Skip Y-column toggles
      if (event.target.closest('.y-column-toggle-btn')) return;
      const toggleBtn = event.target.closest('.toggle-btn');
      if (!toggleBtn) return;
      try { if (typeof toggleBtn.blur === 'function') toggleBtn.blur(); } catch (e) {
        console.error('Error blurring toggle button:', e);
      }
      event.preventDefault();
      event.stopPropagation();

      const groupId = toggleBtn.dataset.targetGroup || toggleBtn.dataset.group;
      const parentRow = toggleBtn.closest('tr');
      if (!parentRow || !groupId) return;

      if (parentRow.classList.contains('main-row')) {
        toggleMain(groupId);
      } else if (parentRow.classList.contains('peer-row')) {
        togglePeer(groupId);
      }
      try { vm.refreshVirtualTable(); } catch (_) {}
      try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {}
      try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {}
    } catch (e) {
      console.error('Error handling virtual toggle:', e);
    }
  }

  function updateAllToggleButtons() {
    // Always sync toggle labels for currently realized DOM rows.
    // Virtualization materializes rows incrementally; we must not skip updates.
    const container = getContainer();
    if (!container) return;
    let mainUpdated = 0;
    let peerUpdated = 0;

    container.querySelectorAll('.main-row .toggle-btn').forEach(btn => {
      const groupId = btn.dataset.targetGroup || btn.dataset.group;
      if (!groupId) return;
      const newText = isMainExpanded(groupId) ? '−' : '+';
      if (btn.textContent !== newText) { btn.textContent = newText; mainUpdated++; }
    });

    container.querySelectorAll('.peer-row .toggle-btn').forEach(btn => {
      const groupId = btn.dataset.targetGroup || btn.dataset.group;
      if (!groupId) return;
      const newText = isPeerExpanded(groupId) ? '−' : '+';
      if (btn.textContent !== newText) { btn.textContent = newText; peerUpdated++; }
    });
    if (window.DEBUG) console.log(`🔄 Updated toggle buttons: ${mainUpdated} main, ${peerUpdated} peer`);
    // Reset structural change flag after syncing buttons
    try { vm._lastStructuralChange = false; } catch (e) {
      console.error('Error resetting structural change flag:', e);
    }
  }

  function showAllRows() {
    if (!vm.isActive || !vm.lazyData || !vm.adapter) return;
    const ids = (vm.lazyData.mainIndex || []).map(m => m.groupId);
    expandAllMain(ids);
    const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
    // Mark structural change so button sync won't early-return
    try { vm._lastStructuralChange = true; } catch (e) {
      console.error('Error marking structural change:', e);
    }
    vm.adapter.setData(visible);
    // Force paint to avoid flicker before syncing button icons
    try { vm.forceImmediateRender(); } catch (e) {
      console.error('Error forcing immediate render:', e);
    }
    // Ensure toggle buttons reflect the new expanded state
    try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (e) {
      console.error('Error updating toggle buttons:', e);
    }
    try { vm.syncButtonStatesAfterRender && vm.syncButtonStatesAfterRender(); } catch (e) {
      console.error('Error syncing button states:', e);
    }
    try {
      const btn = getExpandAllButton();
      if (btn) { btn.textContent = 'Hide All'; btn.dataset.state = 'shown'; }
      vm.syncExpandCollapseAllButtonLabel();
    } catch (e) {
      console.error('Error syncing expand/collapse all button label:', e);
    }
  }

  function hideAllRows() {
    if (!vm.isActive || !vm.lazyData || !vm.adapter) return;
    collapseAll();
    const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
    // Mark structural change so button sync won't early-return
    try { vm._lastStructuralChange = true; } catch (e) {
      console.error('Error marking structural change:', e);
    }
    vm.adapter.setData(visible);
    try { vm.forceImmediateRender(); } catch (e) {
      console.error('Error forcing immediate render:', e);
    }
    // Ensure toggle buttons reflect the new collapsed state
    try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (e) {
      console.error('Error updating toggle buttons:', e);
    }
    try { vm.syncButtonStatesAfterRender && vm.syncButtonStatesAfterRender(); } catch (e) {
      console.error('Error syncing button states:', e);
    }
    try {
      const btn = getExpandAllButton();
      if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
      vm.syncExpandCollapseAllButtonLabel();
    } catch (e) {
      console.error('Error syncing expand/collapse all button label:', e);
    }
  }

  return { handleVirtualToggle, updateAllToggleButtons, showAllRows, hideAllRows, closeHourlyGroupsUnderMain, processQueuedExpandCollapseAll };
}
