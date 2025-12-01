// static/js/dom/hideYColumns.js
// Responsibility: Toggle visibility of "Yesterday" columns
import { subscribe } from '../state/eventBus.js';
import { toggleYColumnsVisible } from '../state/tableState.js';
import { updateTopScrollbar } from './top-scrollbar.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TOGGLE_BTN_SELECTOR = '.y-column-toggle-btn';
const FLOATING_HEADER_SELECTOR = '.floating-table-header';
const TABLE_SELECTOR = '.results-display__table';
const HIDDEN_CLASS = 'y-columns-hidden';
const SCROLLBAR_UPDATE_DELAY = 50;

const ICON_VISIBLE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>`;
const ICON_HIDDEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588zM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089z"/><path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12-.708.708z"/></svg>`;

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let initialized = false;

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

function handleToggleClick(e) {
  // ignore clicks from floating header
  if (e.target?.closest?.(FLOATING_HEADER_SELECTOR)) return;

  const btn = e.target?.closest?.(TOGGLE_BTN_SELECTOR);
  if (!btn) return;

  toggleYColumnsVisible();
}

function handleVisibilityChange(isVisible) {
  // update table class
  const table = document.querySelector(TABLE_SELECTOR);
  if (table) {
    table.classList.toggle(HIDDEN_CLASS, !isVisible);
  }

  // update all toggle button icons - use indexed loop
  const icon = getYColumnToggleIcon(isVisible);
  const buttons = document.querySelectorAll(TOGGLE_BTN_SELECTOR);
  const len = buttons.length;
  for (let i = 0; i < len; i++) {
    buttons[i].innerHTML = icon;
  }

  // update scrollbar after repaint
  setTimeout(updateTopScrollbar, SCROLLBAR_UPDATE_DELAY);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initYColumnToggle() {
  if (initialized) return;

  document.addEventListener('click', handleToggleClick, true);
  subscribe('tableState:yVisibilityChanged', handleVisibilityChange);

  initialized = true;
}

export function getYColumnToggleIcon(isVisible) {
  return isVisible ? ICON_VISIBLE : ICON_HIDDEN;
}
