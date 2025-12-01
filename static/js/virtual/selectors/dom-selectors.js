// static/js/virtual/selectors/dom-selectors.js
// Responsibility: Centralized DOM selectors for virtualization module

// ─────────────────────────────────────────────────────────────
// Element IDs
// ─────────────────────────────────────────────────────────────

const ID = {
  CONTAINER: 'virtual-scroll-container',
  TABLE: 'summaryTable',
  TBODY: 'tableBody',
  EXPAND_ALL: 'btnExpandCollapseAll',
  SPACER: 'virtual-scroll-spacer',
  STATUS: 'virtual-scroller-status'
};

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

const SELECTOR = {
  Y_TOGGLE: '.y-column-toggle-btn',
  RESULTS_TABLE: '.results-display__table',
  ACTIONS: '.results-display__table-actions'
};

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export const getContainer = () => document.getElementById(ID.CONTAINER);
export const getTable = () => document.getElementById(ID.TABLE);
export const getTbody = () => document.getElementById(ID.TBODY);
export const getExpandAllButton = () => document.getElementById(ID.EXPAND_ALL);
export const getSpacer = () => document.getElementById(ID.SPACER);
export const getStatusIndicator = () => document.getElementById(ID.STATUS);

export const getYToggleButtons = () => document.querySelectorAll(SELECTOR.Y_TOGGLE);
export const getResultsTables = () => document.querySelectorAll(SELECTOR.RESULTS_TABLE);
export const getActionsDiv = () => document.querySelector(SELECTOR.ACTIONS);
