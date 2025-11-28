// static/js/dom/selectors.js
// Responsibility: centralize standard (non-virtual) DOM selectors for the table UI

import { getVirtualManager } from "../state/moduleRegistry.js";

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
  const vm = getVirtualManager();
  return !!(vm && vm.isActive);
}
