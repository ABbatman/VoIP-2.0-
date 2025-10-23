// static/js/virtual/selectors/dom-selectors.js
// Responsibility: centralize DOM element selection for virtualization module
// If DOM structure changes, update only this file.

export function getContainer() {
  return document.getElementById('virtual-scroll-container');
}

export function getTable() {
  return document.getElementById('summaryTable');
}

export function getTbody() {
  return document.getElementById('tableBody');
}

export function getExpandAllButton() {
  return document.getElementById('btnExpandCollapseAll');
}

export function getSpacer() {
  return document.getElementById('virtual-scroll-spacer');
}

export function getYToggleButtons() {
  return document.querySelectorAll('.y-column-toggle-btn');
}

export function getResultsTables() {
  return document.querySelectorAll('.results-display__table');
}

export function getActionsDiv() {
  return document.querySelector('.results-display__table-actions');
}

export function getStatusIndicator() {
  return document.getElementById('virtual-scroller-status');
}
