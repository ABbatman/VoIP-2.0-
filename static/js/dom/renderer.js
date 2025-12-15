// static/js/dom/renderer.js
// Responsibility: Render dashboard HTML framework (no table rows)
import { renderButton } from './components/button.js';
import { getUI } from '../state/appState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

const SELECTORS = {
  resultsDisplay: '.results-display',
  filtersBlock: '#filters-block',
  virtualContainer: 'virtual-scroll-container'
};

// Filter IDs kept for reference
// const FILTER_IDS = [
//   'customerInput', 'supplierInput', 'destinationInput',
//   'customerGroupInput', 'supplierGroupInput', 'destinationGroupInput',
//   'fromDate', 'toDate', 'fromTime', 'toTime'
// ];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getElement(id) {
  return document.getElementById(id);
}

function isInputFocused(input) {
  return document.activeElement === input || input?.matches?.(':focus');
}

function safeSetValue(input, value) {
  if (!input || isInputFocused(input)) return;
  const nextVal = value ?? '';
  if (input.value === '' || input.value !== nextVal) {
    input.value = nextVal;
  }
}

function safeSetDate(input, dateStr) {
  if (!input || isInputFocused(input)) return;
  const nextVal = dateStr ?? '';
  if (input.value === '' || input.value !== nextVal) {
    if (input._flatpickr) {
      input._flatpickr.setDate(nextVal, false);
    } else {
      input.value = nextVal;
    }
  }
}

function setDateWithFlatpickr(input, value) {
  if (!input) return;
  if (input._flatpickr) {
    input._flatpickr.setDate(value, false);
  } else {
    input.value = value;
  }
}

// ─────────────────────────────────────────────────────────────
// DashboardRenderer class
// ─────────────────────────────────────────────────────────────

export class DashboardRenderer {
  constructor() {
    this.isInitialized = false;
    this.currentContainer = null;
  }

  initialize() {
    this.isInitialized = true;
  }

  // render HTML string only
  render(state = {}) {
    const appState = state.app || {};
    return this._renderFramework(appState);
  }

  renderToString(state = {}) {
    const appState = state.app || {};
    return this._renderFramework(appState);
  }

  updateFramework(state = {}) {
    if (!this.currentContainer) return;

    try {
      const appState = state.app || {};
      this._updateFilters(appState);
      this._updateDashboardView(appState);
      this._updateTableControls();
      this._applyStateStyling(appState);
    } catch (e) {
      logError(ErrorCategory.RENDER, 'DashboardRenderer:updateFramework', e);
    }
  }

  async _initializeUIComponents() {
    try {
      const { initFlatpickr, initTimeControls } = await import('./ui-widgets.js');
      initFlatpickr();
      initTimeControls();
      this._setDefaultDatesIfEmpty();
    } catch (e) {
      logError(ErrorCategory.RENDER, 'DashboardRenderer:initUIComponents', e);
    }
  }

  _setDefaultDatesIfEmpty() {
    const fromDate = getElement('fromDate');
    const toDate = getElement('toDate');
    const fromTime = getElement('fromTime');
    const toTime = getElement('toTime');

    if (!fromDate || !toDate || !fromTime || !toTime) return;
    if (fromDate.value && toDate.value) return;

    const now = new Date();
    const from = new Date(now.getTime() - DAY_MS);

    setDateWithFlatpickr(fromDate, from.toISOString().slice(0, 10));
    setDateWithFlatpickr(toDate, now.toISOString().slice(0, 10));
    fromTime.value = from.toISOString().slice(11, 19);
    toTime.value = now.toISOString().slice(11, 19);
  }

  _getContainer(container) {
    if (typeof container === 'string') {
      return getElement(container) || document.querySelector(container);
    }
    if (container instanceof HTMLElement) {
      return container;
    }
    return this.currentContainer || null;
  }

  // ─────────────────────────────────────────────────────────────
  // Framework rendering
  // ─────────────────────────────────────────────────────────────

  _renderFramework(appState) {
    return `
      <div class="page-container">
        ${this._renderFilters(appState)}
        ${this._renderSummaryMetrics()}
        ${this._renderTableSection()}
        ${this._renderTimeControls()}
        ${this._renderOverlays()}
      </div>
    `;
  }

  _renderFilters(appState) {
    const filters = appState.filters || {};
    const dashboardView = appState.dashboardView || {};
    const ui = getUI();
    const showModeControls = !!ui.showModeControls;

    const reverseIcon = `<svg class="filters-panel__icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;

    return `
      <div id="filters-block" class="filters-panel">
        <div class="filters-row-primary">
            <div id="customer-filter-item" class="filters-panel__item">
              <input id="customerInput" class="filters-panel__input" type="text" placeholder="Customer" value="${filters.customer || ''}" />
            </div>
            <div id="reverse-button-item" class="filters-panel__item">
              ${renderButton({ id: 'btnReverse', className: 'btn btn--icon', title: 'Reverse Customer/Supplier', icon: reverseIcon })}
            </div>
            <div id="supplier-filter-item" class="filters-panel__item">
              <input id="supplierInput" class="filters-panel__input" type="text" placeholder="Supplier" value="${filters.supplier || ''}" />
            </div>
            <div id="destination-filter-item" class="filters-panel__item">
              <input id="destinationInput" class="filters-panel__input" type="text" placeholder="Destination" value="${filters.destination || ''}" />
            </div>

            <div class="filters-panel__spacer"></div>

            <div class="filters-panel__item filters-panel__item--datetime">
              <div class="filters-panel__input-group">
                <input id="fromDate" class="filters-panel__input date-part" type="text" title="From Date" value="${filters.from ? filters.from.split(' ')[0] : ''}" />
                <input id="fromTime" class="filters-panel__input time-part" type="time" step="1" title="From Time" value="${filters.from ? filters.from.split(' ')[1] : ''}" />
              </div>
            </div>
            <div class="filters-panel__item filters-panel__item--datetime">
              <div class="filters-panel__input-group">
                <input id="toDate" class="filters-panel__input date-part" type="text" title="To Date" value="${filters.to ? filters.to.split(' ')[0] : ''}" />
                <input id="toTime" class="filters-panel__input time-part" type="time" step="1" title="To Time" value="${filters.to ? filters.to.split(' ')[1] : ''}" />
              </div>
            </div>

            <div class="filters-panel__spacer"></div>

            ${renderButton({ id: 'findButton', className: 'btn btn--primary', text: 'Find' })}
            <div id="tableModeControls" class="filters-panel__control-group" style="${showModeControls ? '' : 'display:none'}">
              <button id="btnSummary" class="btn btn--primary ${dashboardView.currentMode === 'summary' ? 'active' : ''}">Summary Table</button>
            </div>
        </div> <!-- End filters-row-primary -->

        <!-- Secondary Row: Group Inputs -->
        <div id="customer-group-filter-item" class="filters-panel__item">
          <input id="customerGroupInput" class="filters-panel__input" type="text" placeholder="Customer group" value="${filters.customerGroup || ''}" />
        </div>
        <div id="supplier-group-filter-item" class="filters-panel__item">
          <input id="supplierGroupInput" class="filters-panel__input" type="text" placeholder="Supplier group" value="${filters.supplierGroup || ''}" />
        </div>
        <div id="destination-group-filter-item" class="filters-panel__item">
          <input id="destinationGroupInput" class="filters-panel__input" type="text" placeholder="Destination group" value="${filters.destinationGroup || ''}" />
        </div>
        
        <div class="filters-panel__spacer"></div>

        <div id="cdr-button-item" class="filters-panel__item" style="${showModeControls ? '' : 'display:none'}">
          <button id="btnCDR" class="btn ${dashboardView.currentMode === 'cdr' ? 'active' : ''}">CDR</button>
        </div>
      </div>
    `;
  }

  _renderSummaryMetrics() {
    const ui = getUI();
    const showCharts = !!ui.showCharts;
    return `
      <div id="summaryMetrics" class="summary-display" style="display:none" aria-hidden="true"></div>
      <div id="charts-container" class="charts-container" style="${showCharts ? '' : 'display:none'}">
        <div id="chart-area-1"></div>
      </div>
      <div id="chart-slider" class="chart-slider" style="${showCharts ? '' : 'display:none'}"></div>
      <div id="charts-controls" class="charts-toolbar" style="${showCharts ? '' : 'display:none'}"></div>
    `;
  }

  _renderTableSection() {
    return `
      <div class="results-display is-hidden">
        <div id="table-controls" class="results-display__controls">
          <div class="results-display__table-actions">
            ${renderButton({ id: 'btnExpandCollapseAll', className: 'btn', text: 'Show All' })}
            <span id="virtual-scroller-status" class="virtual-scroller-status is-hidden">Virtual Scrolling Active</span>
          </div>
          <div class="results-display__filter">
            <input type="text" id="table-filter-input" placeholder="Filter table...">
          </div>
        </div>
        <div id="top-scrollbar-container" class="top-scrollbar-container">
          <div id="top-scrollbar-content" class="top-scrollbar-content"></div>
        </div>
        <div class="results-display__table-wrapper virtual-scroller-container" id="virtual-scroll-container" style="overflow-y: visible; position: relative;">
          <div id="virtual-scroll-spacer" style="position: absolute; top: 0; left: 0; right: 0; pointer-events: none;"></div>
          <table id="summaryTable" class="results-display__table" style="position: relative;">
            <thead id="tableHead"></thead>
            <tbody id="tableBody"></tbody>
            <tfoot><tr><td id="table-footer-info" colspan="24"></td></tr></tfoot>
          </table>
        </div>
      </div>
    `;
  }

  _renderTimeControls() {
    return `
      <div id="time-controls" class="time-popup">
        <button class="time-popup__button" data-action="hour-minus">-</button>
        <button class="time-popup__button" data-action="now">N</button>
        <button class="time-popup__button" data-action="zero">Z</button>
        <button class="time-popup__button" data-action="hour-plus">+</button>
      </div>
    `;
  }

  _renderOverlays() {
    return `
      <div id="pdd-atime-tooltip" class="pdd-atime-tooltip is-hidden"></div>
      <div id="loading-overlay" class="loading-overlay is-hidden"><div class="spinner"></div></div>
      <div id="toast-container" class="toast-container"></div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // State updates
  // ─────────────────────────────────────────────────────────────

  _updateFilters(appState) {
    const filters = appState.filters || {};

    safeSetValue(getElement('customerInput'), filters.customer || '');
    safeSetValue(getElement('supplierInput'), filters.supplier || '');
    safeSetValue(getElement('destinationInput'), filters.destination || '');

    if (filters.from) {
      const [fromDate, fromTime] = filters.from.split(' ');
      safeSetDate(getElement('fromDate'), fromDate || '');
      safeSetValue(getElement('fromTime'), fromTime || '');
    }
    if (filters.to) {
      const [toDate, toTime] = filters.to.split(' ');
      safeSetDate(getElement('toDate'), toDate || '');
      safeSetValue(getElement('toTime'), toTime || '');
    }
  }

  _updateDashboardView(appState) {
    const mode = appState.dashboardView?.currentMode;
    const btnSummary = getElement('btnSummary');
    const btnCDR = getElement('btnCDR');

    if (btnSummary) btnSummary.classList.toggle('active', mode === 'summary');
    if (btnCDR) btnCDR.classList.toggle('active', mode === 'cdr');
  }

  _updateTableControls() {
    // no-op
  }

  _applyStateStyling(appState) {
    const theme = appState.preferences?.theme;
    if (theme) {
      document.body.className = `theme-${theme}`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public methods
  // ─────────────────────────────────────────────────────────────

  getVirtualizedTableContainer() {
    return getElement(SELECTORS.virtualContainer);
  }

  showTable() {
    const el = document.querySelector(SELECTORS.resultsDisplay);
    if (el) el.classList.remove('is-hidden');
  }

  hideTable() {
    const el = document.querySelector(SELECTORS.resultsDisplay);
    if (el) el.classList.add('is-hidden');
  }

  destroy() {
    this.currentContainer = null;
    this.isInitialized = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Filter save/restore
  // ─────────────────────────────────────────────────────────────

  _saveCurrentFilterValues(container) {
    const block = container.querySelector(SELECTORS.filtersBlock);
    if (!block) return null;

    const get = id => block.querySelector(`#${id}`)?.value || '';

    return {
      customer: get('customerInput'),
      supplier: get('supplierInput'),
      destination: get('destinationInput'),
      customerGroup: get('customerGroupInput'),
      supplierGroup: get('supplierGroupInput'),
      destinationGroup: get('destinationGroupInput'),
      from: `${get('fromDate')} ${get('fromTime')}`.trim(),
      to: `${get('toDate')} ${get('toTime')}`.trim()
    };
  }

  _restoreFilterValues(container, values) {
    const block = container.querySelector(SELECTORS.filtersBlock);
    if (!block || !values) return;

    const set = (id, val) => {
      const el = block.querySelector(`#${id}`);
      if (el) el.value = val || '';
    };

    set('customerInput', values.customer);
    set('supplierInput', values.supplier);
    set('destinationInput', values.destination);
    set('customerGroupInput', values.customerGroup);
    set('supplierGroupInput', values.supplierGroup);
    set('destinationGroupInput', values.destinationGroup);

    if (values.from) {
      const [fromDate, fromTime] = values.from.split(' ');
      const dateEl = block.querySelector('#fromDate');
      setDateWithFlatpickr(dateEl, fromDate);
      set('fromTime', fromTime);
    }

    if (values.to) {
      const [toDate, toTime] = values.to.split(' ');
      const dateEl = block.querySelector('#toDate');
      setDateWithFlatpickr(dateEl, toDate);
      set('toTime', toTime);
    }
  }
}

// Export singleton instance
export const dashboardRenderer = new DashboardRenderer();

// Export convenience functions
export const render = (state, container) => dashboardRenderer.render(state, container);
export const updateFramework = (state) => dashboardRenderer.updateFramework(state);
export const getVirtualizedTableContainer = () => dashboardRenderer.getVirtualizedTableContainer();
export const showTable = () => dashboardRenderer.showTable();
export const hideTable = () => dashboardRenderer.hideTable();
