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
    try { vm._expandAllElement.removeEventListener('click', vm.boundExpandAllHandler); } catch (_) {}
  }
  if (!vm.boundExpandAllHandler) {
    vm.boundExpandAllHandler = async () => {
      try {
        const state = btn.dataset.state || 'hidden'; // hidden -> collapsed; shown -> expanded
        if (!vm.lazyData || !vm.adapter) {
          // queue intent for later when data is ready
          vm._expandCollapseAllQueued = (state === 'hidden') ? 'expand' : 'collapse';
          return;
        }
        btn.disabled = true;
        if (state === 'hidden') {
          // expand only main groups (peers visible), hours remain collapsed
          vm.showAllRows && vm.showAllRows();
          btn.textContent = 'Hide All';
          btn.dataset.state = 'shown';
        } else {
          vm.hideAllRows && vm.hideAllRows();
          btn.textContent = 'Show All';
          btn.dataset.state = 'hidden';
        }
        try { vm.updateAllToggleButtons && vm.updateAllToggleButtons(); } catch (_) {}
        try { vm.syncExpandCollapseAllButton && vm.syncExpandCollapseAllButton(vm); } catch (_) {}
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
