// static/js/virtual/manager/ui-state.js
// Layer: UI state helpers for virtual module (mode toggles, status)
import { getActionsDiv, getStatusIndicator } from '../selectors/dom-selectors.js';

export function attachUI() {
  function updateUI(isVirtualMode) {
    const actionsDiv = getActionsDiv();
    const statusIndicator = getStatusIndicator();

    if (isVirtualMode) {
      if (statusIndicator) statusIndicator.classList.remove('is-hidden');
      if (actionsDiv) actionsDiv.classList.add('virtual-mode');
      try { console.log('🔄 Virtual Manager: UI updated for virtual mode'); } catch(_) {}
    } else {
      if (statusIndicator) statusIndicator.classList.add('is-hidden');
      if (actionsDiv) actionsDiv.classList.remove('virtual-mode');
      try { console.log('🔄 Virtual Manager: UI updated for standard mode'); } catch(_) {}
    }
  }

  function shouldUseVirtualization() {
    // Always use virtualization - no pagination
    return true;
  }

  return { updateUI, shouldUseVirtualization };
}
