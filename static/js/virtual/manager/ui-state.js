// static/js/virtual/manager/ui-state.js
// Responsibility: UI state helpers for virtual mode
import { getActionsDiv, getStatusIndicator } from '../selectors/dom-selectors.js';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function attachUI() {
  function updateUI(isVirtualMode) {
    const actionsDiv = getActionsDiv();
    const statusIndicator = getStatusIndicator();

    statusIndicator?.classList.toggle('is-hidden', !isVirtualMode);
    actionsDiv?.classList.toggle('virtual-mode', isVirtualMode);
  }

  const shouldUseVirtualization = () => true;

  return { updateUI, shouldUseVirtualization };
}
