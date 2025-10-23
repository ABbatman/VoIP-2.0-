// static/js/dom/selectors.js
// Responsibility: centralize standard (non-virtual) DOM selectors for the table UI

export function getTableBody() {
  return document.getElementById('tableBody');
}

export function getMainToggleButtons(root = document) {
  const scope = root || document;
  return Array.from(scope.querySelectorAll('.main-row .toggle-btn'));
}

export function getPeerToggleButtons(root = document) {
  const scope = root || document;
  return Array.from(scope.querySelectorAll('.peer-row .toggle-btn'));
}

export function getExpandAllButton() {
  return document.getElementById('btnExpandCollapseAll');
}

export function isVirtualModeActive() {
  // Strict detection: rely only on real VM state to prevent false positives
  try { return !!(window.virtualManager && window.virtualManager.isActive); } catch (_) { return false; }
}
