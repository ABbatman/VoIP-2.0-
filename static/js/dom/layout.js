// static/js/dom/layout.js
// Responsibility: Sync layout elements with app state
import { subscribe } from '../state/eventBus.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const REVERSE_BUTTON_ID = 'btnReverse';
const ACTIVE_CLASS = 'active';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initLayoutSync() {
  subscribe('appState:reverseModeChanged', updateReverseButtonState);
}

export function updateReverseButtonState(isReversed) {
  const btn = document.getElementById(REVERSE_BUTTON_ID);
  if (btn) {
    btn.classList.toggle(ACTIVE_CLASS, isReversed);
  }
}
