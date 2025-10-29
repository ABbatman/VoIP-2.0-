// Events module for VirtualManager
// Responsibility: bind/unbind DOM event handlers (toggle, dblclick) idempotently
import { getContainer, getTbody, getExpandAllButton } from '../selectors/dom-selectors.js';

export function bindToggleHandlers(vm) {
  const container = getContainer();
  if (!container) {
    console.warn('❌ bindToggleHandlers: virtual-scroll-container not found!');
    return;
  }
  const tbody = getTbody();
  if (!tbody) {
    console.warn('❌ bindToggleHandlers: tableBody not found!');
    return;
  }
  if (vm._toggleBound && vm._toggleBoundElement === tbody && vm.boundToggleHandler) {
    return; // already bound to same element
  }
  if (vm._toggleBound && vm._toggleBoundElement && vm.boundToggleHandler && vm._toggleBoundElement !== tbody) {
    try { vm._toggleBoundElement.removeEventListener('click', vm.boundToggleHandler); } catch (_) {
      // Ignore event removal errors
    }
  }
  if (!vm.boundToggleHandler) {
    vm.boundToggleHandler = (event) => {
      try {
        if (vm.toggles && typeof vm.toggles.handleVirtualToggle === 'function') {
          return vm.toggles.handleVirtualToggle(event);
        }
      } catch (_) {
        // Ignore toggle handler errors
      }
    };
  }
  tbody.addEventListener('click', vm.boundToggleHandler);
  vm._toggleBound = true;
  vm._toggleBoundElement = tbody;
}

export function unbindToggleHandlers(vm) {
  if (vm._toggleBound && vm._toggleBoundElement && vm.boundToggleHandler) {
    try { vm._toggleBoundElement.removeEventListener('click', vm.boundToggleHandler); } catch (_) {
      // Ignore event removal errors
    }
  }
  vm._toggleBound = false;
  vm._toggleBoundElement = null;
  vm.boundToggleHandler = null;
}

export function bindDblClickHandlers(vm) {
  const tbody = getTbody();
  if (!tbody) {
    console.warn('❌ bindDblClickHandlers: tableBody not found!');
    return;
  }
  if (vm._dblFilterBound && vm._dblFilterElement === tbody && vm.boundDblFilterHandler) {
    return; // already bound to same element
  }
  if (vm._dblFilterBound && vm._dblFilterElement && vm.boundDblFilterHandler && vm._dblFilterElement !== tbody) {
    try { vm._dblFilterElement.removeEventListener('dblclick', vm.boundDblFilterHandler); } catch (_) {
      // Ignore event removal errors
    }
  }
  if (!vm.boundDblFilterHandler) {
    vm.boundDblFilterHandler = (event) => {
      try {
        if (event.target.closest('.toggle-btn')) return; // ignore toggle button
        const td = event.target.closest('td');
        if (!td) return;
        let column = td.dataset.filterColumn || null;
        if (!column) {
          if (td.classList.contains('main-cell') && !td.classList.contains('hour-datetime')) column = 'main';
          else if (td.classList.contains('peer-cell')) column = 'peer';
          else if (td.classList.contains('destination-cell')) column = 'destination';
          else if (td.classList.contains('hour-datetime')) column = 'date';
        }
        if (!column) return;
        const raw = td.getAttribute('data-filter-value') || td.getAttribute('data-full-text') || (td.textContent || '');
        const value = (raw || '').toString().trim();
        if (!value) return;
        let handled = false;
        try {
          if (window.applyFooterFilter && typeof window.applyFooterFilter === 'function') {
            window.applyFooterFilter(column, value, { append: true });
            handled = true;
          }
        } catch (_) { /* no-op */ }
        if (!handled) {
          const ev = new CustomEvent('table:applyFooterFilter', { detail: { column, value, append: true } });
          document.dispatchEvent(ev);
        }
        event.preventDefault();
        event.stopPropagation();
      } catch (e) {
        console.warn('dblclick filter handler error', e);
      }
    };
  }
  tbody.addEventListener('dblclick', vm.boundDblFilterHandler);
  vm._dblFilterBound = true;
  vm._dblFilterElement = tbody;
}

export function unbindDblClickHandlers(vm) {
  if (vm._dblFilterBound && vm._dblFilterElement && vm.boundDblFilterHandler) {
    try { vm._dblFilterElement.removeEventListener('dblclick', vm.boundDblFilterHandler); } catch (_) {
      // Ignore event removal errors
    }
  }
  vm._dblFilterBound = false;
  vm._dblFilterElement = null;
  vm.boundDblFilterHandler = null;
}

// Expand/Collapse All handler
export function bindExpandCollapseAll(vm) {
  const btn = getExpandAllButton();
  if (!btn) return;
  if (vm._expandAllBound && vm._expandAllElement === btn && vm.boundExpandAllHandler) {
    return;
  }
  if (vm._expandAllBound && vm._expandAllElement && vm.boundExpandAllHandler && vm._expandAllElement !== btn) {
    try { vm._expandAllElement.removeEventListener('click', vm.boundExpandAllHandler); } catch (_) {
      // Ignore event removal errors
    }
  }
  if (!vm.boundExpandAllHandler) {
    vm.boundExpandAllHandler = async () => {
      try {
        // Preserve scroll and disable scroll anchoring to prevent jumps
        const prevWX = window.pageXOffset || 0;
        const prevWY = window.pageYOffset || 0;
        const container = document.getElementById('virtual-scroll-container');
        const prevCX = container ? container.scrollLeft : null;
        const prevCY = container ? container.scrollTop : null;
        const root = document.documentElement;
        try { if (root) root.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore event errors
    }
        try { if (document.body) document.body.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore event errors
    }
        try { if (container) container.style.overflowAnchor = 'none'; } catch(_) {
      // Ignore event errors
    }
        const state = btn.dataset.state || 'hidden'; // hidden -> collapsed; shown -> expanded
        // If data not ready yet (early click after page load), retry shortly without disabling button
        if (!vm.lazyData || !vm.adapter) {
          console.log('⚠️ Expand/Collapse All: data not ready, retrying shortly...');
          setTimeout(() => { try { vm.boundExpandAllHandler && vm.boundExpandAllHandler(); } catch (_) {
            // Ignore retry errors
          } }, 50);
          return;
        }
        btn.disabled = true;
        if (state === 'hidden') {
          // Expand all: open ONLY main groups (to show all peers). Do NOT open hourly groups.
          vm.openMainGroups.clear();
          for (const m of vm.lazyData.mainIndex) vm.openMainGroups.add(m.groupId);
          // Ensure hourly groups remain collapsed
          vm.openHourlyGroups.clear();
          // Compute visible slice and set directly on adapter
          console.log('🔼 Show All: main to open =', vm.openMainGroups.size);
          // Force peers for this render regardless of openMainGroups race
          vm._forceShowPeers = true;
          const visible = vm.getLazyVisibleData();
          vm.adapter.setData(visible);
          try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {
            // Ignore render errors
          }
          // Reset force flag on next tick so normal toggles work
          Promise.resolve().then(() => { try { vm._forceShowPeers = false; } catch (_) {
            // Ignore flag reset errors
          } });
          btn.textContent = 'Hide All';
          btn.dataset.state = 'shown';
          // Verify after render that groups remain open; if not, reapply once
          setTimeout(() => {
            try {
              if (vm.openMainGroups && vm.openMainGroups.size === 0) {
                console.warn('⚠️ Show All: openMainGroups empty after render, reapplying once');
                for (const m of vm.lazyData.mainIndex) vm.openMainGroups.add(m.groupId);
                vm.openHourlyGroups.clear();
                const vis2 = vm.getLazyVisibleData();
                vm.adapter.setData(vis2);
                try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {
                  // Ignore render errors
                }
              }
            } catch (_) {
              // Ignore reapply errors
            }
          }, 0);
        } else {
          // Collapse all
          vm.openMainGroups.clear();
          vm.openHourlyGroups.clear();
          const visible = vm.getLazyVisibleData();
          vm.adapter.setData(visible);
          try { vm.forceImmediateRender && vm.forceImmediateRender(); } catch (_) {
            // Ignore render errors
          }
          btn.textContent = 'Show All';
          btn.dataset.state = 'hidden';
        }
        // Sync toggle icons after state change if manager provides it
        try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {
          // Ignore toggle update errors
        }
        try { vm.syncExpandCollapseAllButton && vm.syncExpandCollapseAllButton(vm); } catch (_) {
          // Ignore button sync errors
        }
        // Restore scroll positions on next frames
        requestAnimationFrame(() => {
          try { if (container && prevCY != null) container.scrollTop = prevCY; if (container && prevCX != null) container.scrollLeft = prevCX; } catch(_) {
      // Ignore event errors
    }
          requestAnimationFrame(() => {
            try { window.scrollTo(prevWX, prevWY); } catch(_) {
      // Ignore event errors
    }
            try { if (root) root.style.overflowAnchor = ''; } catch(_) {
      // Ignore event errors
    }
            try { if (document.body) document.body.style.overflowAnchor = ''; } catch(_) {
      // Ignore event errors
    }
            try { if (container) container.style.overflowAnchor = ''; } catch(_) {
      // Ignore event errors
    }
          });
        });
        // Fallbacks
        Promise.resolve().then(() => { try { if (container && prevCY != null) container.scrollTop = prevCY; if (container && prevCX != null) container.scrollLeft = prevCX; window.scrollTo(prevWX, prevWY); if (root) root.style.overflowAnchor = ''; if (document.body) document.body.style.overflowAnchor = ''; if (container) container.style.overflowAnchor = ''; } catch(_) {
      // Ignore event errors
    } });
        setTimeout(() => { try { if (container && prevCY != null) container.scrollTop = prevCY; if (container && prevCX != null) container.scrollLeft = prevCX; window.scrollTo(prevWX, prevWY); if (root) root.style.overflowAnchor = ''; if (document.body) document.body.style.overflowAnchor = ''; if (container) container.style.overflowAnchor = ''; } catch(_) {
      // Ignore event errors
    } }, 50);
      } finally {
        btn.disabled = false;
      }
    };
  }
  btn.addEventListener('click', vm.boundExpandAllHandler);
  vm._expandAllBound = true;
  vm._expandAllElement = btn;
}

export function unbindExpandCollapseAll(vm) {
  const btn = vm._expandAllElement;
  if (vm._expandAllBound && btn && vm.boundExpandAllHandler) {
    try { btn.removeEventListener('click', vm.boundExpandAllHandler); } catch (_) {
      // Ignore event removal errors
    }
  }
  vm._expandAllBound = false;
  vm._expandAllElement = null;
  vm.boundExpandAllHandler = null;
}

// Sync button label/state with current VM open groups
export function syncExpandCollapseAllButton(vm) {
  const btn = getExpandAllButton();
  if (!btn) return;
  const anyOpen = vm && vm.openMainGroups && vm.openMainGroups.size > 0;
  if (anyOpen) {
    if (btn.textContent !== 'Hide All') btn.textContent = 'Hide All';
    if (btn.dataset.state !== 'shown') btn.dataset.state = 'shown';
  } else {
    if (btn.textContent !== 'Show All') btn.textContent = 'Show All';
    if (btn.dataset.state !== 'hidden') btn.dataset.state = 'hidden';
  }
}
