// static/js/virtual/manager/toggles.js
// Layer: toggles (expand/collapse, bulk show/hide, button icons sync)
import { getContainer, getExpandAllButton } from '../selectors/dom-selectors.js';

export function attachToggles(vm) {
  function closeHourlyGroupsUnderMain(mainGroupId) {
    const toRemove = Array.from(vm.openHourlyGroups).filter(hourlyId =>
      hourlyId.startsWith(`peer-${mainGroupId.replace('main-', '')}`)
    );
    toRemove.forEach(id => vm.openHourlyGroups.delete(id));
    return toRemove.length;
  }

  function processQueuedExpandCollapseAll() {
    const btn = getExpandAllButton();
    const queued = vm._expandCollapseAllQueued;
    if (!queued) return;
    vm._expandCollapseAllQueued = null;
    if (!vm.lazyData || !vm.adapter) return;
    try {
      if (queued === 'expand') {
        vm.openMainGroups.clear();
        for (const m of vm.lazyData.mainIndex) vm.openMainGroups.add(m.groupId);
        vm.openHourlyGroups.clear();
        const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
        vm.adapter.setData(visible);
        try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {}
        if (btn) { btn.textContent = 'Hide All'; btn.dataset.state = 'shown'; }
      } else if (queued === 'collapse') {
        vm.openMainGroups.clear();
        vm.openHourlyGroups.clear();
        const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
        vm.adapter.setData(visible);
        try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {}
        if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
      }
      try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {}
      try { vm.syncExpandCollapseAllButtonLabel && vm.syncExpandCollapseAllButtonLabel(); } catch (_) { /* no-op */ }
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
      // Preserve window and container scroll to avoid jump-to-top on reflow/rerender
      const prevX = window.pageXOffset || 0;
      const prevY = window.pageYOffset || 0;
      const container = getContainer();
      const prevCX = container ? container.scrollLeft : null;
      const prevCY = container ? container.scrollTop : null;
      // Disable scroll anchoring during structural change
      try { if (container) container.style.overflowAnchor = 'none'; } catch(_) {}
      try { if (typeof toggleBtn.blur === 'function') toggleBtn.blur(); } catch(_) {}
      event.preventDefault();
      event.stopPropagation();

      const groupId = toggleBtn.dataset.targetGroup || toggleBtn.dataset.group;
      const parentRow = toggleBtn.closest('tr');
      if (!parentRow || !groupId) return;

      let isCurrentlyExpanded = false;
      if (parentRow.classList.contains('main-row')) {
        isCurrentlyExpanded = vm.openMainGroups.has(groupId);
      } else if (parentRow.classList.contains('peer-row')) {
        isCurrentlyExpanded = vm.openHourlyGroups.has(groupId);
      }

      if (parentRow.classList.contains('main-row')) {
        if (isCurrentlyExpanded) {
          vm.openMainGroups.delete(groupId);
          // Also close hourly under this main
          const toRemove = Array.from(vm.openHourlyGroups).filter(h => h.startsWith(`peer-${groupId.replace('main-', '')}`));
          toRemove.forEach(id => vm.openHourlyGroups.delete(id));
          toggleBtn.textContent = '+';
        } else {
          vm.openMainGroups.add(groupId);
          toggleBtn.textContent = '−';
        }
      } else if (parentRow.classList.contains('peer-row')) {
        if (isCurrentlyExpanded) {
          vm.openHourlyGroups.delete(groupId);
          toggleBtn.textContent = '+';
        } else {
          vm.openHourlyGroups.add(groupId);
          toggleBtn.textContent = '−';
        }
      }

      vm.refreshVirtualTable();
      setTimeout(() => {
        try { vm.forceImmediateRender(); } catch (_) {}
        try { vm.updateAllToggleButtons(); } catch (_) {}
        // Restore scroll (container first, then window) on next frames; also clear overflow-anchor
        requestAnimationFrame(() => {
          try {
            if (container && prevCY != null) container.scrollTop = prevCY;
            if (container && prevCX != null) container.scrollLeft = prevCX;
          } catch(_) {}
          requestAnimationFrame(() => { try { window.scrollTo(prevX, prevY); } catch (_) {} });
          // Microtask + delayed fallback
          Promise.resolve().then(() => {
            try {
              if (container && prevCY != null) container.scrollTop = prevCY;
              if (container && prevCX != null) container.scrollLeft = prevCX;
              window.scrollTo(prevX, prevY);
            } catch(_) {}
          });
          setTimeout(() => {
            try {
              if (container && prevCY != null) container.scrollTop = prevCY;
              if (container && prevCX != null) container.scrollLeft = prevCX;
              window.scrollTo(prevX, prevY);
              if (container) container.style.overflowAnchor = '';
            } catch(_) {}
          }, 50);
        });
      }, 10);
    } catch (_) {}
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
      const newText = vm.openMainGroups.has(groupId) ? '−' : '+';
      if (btn.textContent !== newText) { btn.textContent = newText; mainUpdated++; }
    });

    container.querySelectorAll('.peer-row .toggle-btn').forEach(btn => {
      const groupId = btn.dataset.targetGroup || btn.dataset.group;
      if (!groupId) return;
      const newText = vm.openHourlyGroups.has(groupId) ? '−' : '+';
      if (btn.textContent !== newText) { btn.textContent = newText; peerUpdated++; }
    });
    if (window.DEBUG) console.log(`🔄 Updated toggle buttons: ${mainUpdated} main, ${peerUpdated} peer`);
    // Reset structural change flag after syncing buttons
    try { vm._lastStructuralChange = false; } catch (_) {}
  }

  function showAllRows() {
    if (!vm.isActive || !vm.lazyData || !vm.adapter) return;
    vm.openMainGroups.clear();
    for (const m of vm.lazyData.mainIndex) vm.openMainGroups.add(m.groupId);
    vm.openHourlyGroups.clear();
    const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
    // Mark structural change so button sync won't early-return
    try { vm._lastStructuralChange = true; } catch (_) {}
    vm.adapter.setData(visible);
    // Force paint to avoid flicker before syncing button icons
    try { vm.forceImmediateRender(); } catch (_) {}
    // Ensure toggle buttons reflect the new expanded state
    try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {}
    try { vm.syncButtonStatesAfterRender && vm.syncButtonStatesAfterRender(); } catch (_) {}
    try {
      const btn = getExpandAllButton();
      if (btn) { btn.textContent = 'Hide All'; btn.dataset.state = 'shown'; }
      vm.syncExpandCollapseAllButtonLabel();
    } catch (_) {}
  }

  function hideAllRows() {
    if (!vm.isActive || !vm.lazyData || !vm.adapter) return;
    vm.openMainGroups.clear();
    vm.openHourlyGroups.clear();
    const visible = vm.selectors ? vm.selectors.getLazyVisibleData() : vm.getLazyVisibleData();
    // Mark structural change so button sync won't early-return
    try { vm._lastStructuralChange = true; } catch (_) {}
    vm.adapter.setData(visible);
    try { vm.forceImmediateRender(); } catch (_) {}
    // Ensure toggle buttons reflect the new collapsed state
    try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {}
    try { vm.syncButtonStatesAfterRender && vm.syncButtonStatesAfterRender(); } catch (_) {}
    try {
      const btn = getExpandAllButton();
      if (btn) { btn.textContent = 'Show All'; btn.dataset.state = 'hidden'; }
      vm.syncExpandCollapseAllButtonLabel();
    } catch (_) {}
  }

  return { handleVirtualToggle, updateAllToggleButtons, showAllRows, hideAllRows, closeHourlyGroupsUnderMain, processQueuedExpandCollapseAll };
}
