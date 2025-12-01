// static/js/dom/selectors.js
// Responsibility: Centralized DOM selectors for table UI
import { getVirtualManager } from '../state/moduleRegistry.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const IDS = {
  tableBody: 'tableBody',
  expandAllBtn: 'btnExpandCollapseAll'
};

const SELECTORS = {
  mainToggle: '.main-row .toggle-btn',
  peerToggle: '.peer-row .toggle-btn'
};

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function getTableBody() {
  return document.getElementById(IDS.tableBody);
}

export function getMainToggleButtons(root = document) {
  return Array.from((root || document).querySelectorAll(SELECTORS.mainToggle));
}

export function getPeerToggleButtons(root = document) {
  return Array.from((root || document).querySelectorAll(SELECTORS.peerToggle));
}

export function getExpandAllButton() {
  return document.getElementById(IDS.expandAllBtn);
}

export function isVirtualModeActive() {
  const vm = getVirtualManager();
  return !!(vm?.isActive);
}
