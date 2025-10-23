// static/js/dom/renderer.js
// Dashboard Renderer Module - Single Responsibility: Render HTML Framework
// Creates the complete HTML structure for the dashboard without rendering table rows

import { renderButton } from './components/button.js';
import { getUI } from '../state/appState.js';

/**
 * Dashboard Renderer
 * Responsibility: Create and update the HTML framework for the dashboard
 */
export class DashboardRenderer {
  constructor() {
    this.isInitialized = false;
    this.currentContainer = null;
  }

  /**
   * Initialize the renderer
   */
  initialize() {
    this.isInitialized = true;
  }

  /**
   * Render the complete dashboard HTML framework
   * NOTE: Do not mutate DOM here; return an HTML string only. Use domPatcher+morphdom for actual updates.
   * @param {Object} state - Application state object
   * @returns {string} HTML string
   */
  render(state = {}) {
    try {
      // Get current state if not provided
      const appState = state.app || {};
      // return HTML string only
      const framework = this._renderFramework(appState);
      return framework;
    } catch (error) {
      console.error('❌ Dashboard Renderer: Failed to render framework', error);
      throw error;
    }
  }

  /**
   * Render the complete dashboard HTML framework to string (no DOM writes)
   * @param {Object} state - Application state object with shape { app, table }
   * @returns {string} HTML string of the framework
   */
  renderToString(state = {}) {
    // Keep behavior identical to render(): derive sub-states from argument
    const appState = state.app || {};
    return this._renderFramework(appState); // return HTML string only
  }

  /**
   * Update specific parts of the framework based on state changes
   * @param {Object} state - Updated state object
   */
  updateFramework(state = {}) {
    if (!this.currentContainer) {
      console.warn('⚠️ Dashboard Renderer: No container to update');
      return;
    }

    try {
      const appState = state.app || {};

      // Update filters section
      this._updateFilters(appState);

      // Update dashboard view controls
      this._updateDashboardView(appState);

      // Update table controls
      this._updateTableControls();

      // Apply state-based styling
      this._applyStateStyling(appState);

    } catch (error) {
      console.error('❌ Dashboard Renderer: Failed to update framework', error);
    }
  }

  /**
   * Initialize UI components after rendering
   */
  async _initializeUIComponents() {
    try {
      // Import and initialize flatpickr and time controls
      const { initFlatpickr, initTimeControls } = await import('./ui-widgets.js');
      
      // Initialize flatpickr for date inputs
      initFlatpickr();
      
      // Initialize time controls
      initTimeControls();
      
      // Set default date range if no dates are set
      this._setDefaultDatesIfEmpty();
      
    } catch (error) {
      console.error('❌ Dashboard Renderer: Failed to initialize UI components', error);
    }
  }

  /**
   * Set default dates if they are empty
   */
  _setDefaultDatesIfEmpty() {
    const fromDate = document.getElementById('fromDate');
    const toDate = document.getElementById('toDate');
    const fromTime = document.getElementById('fromTime');
    const toTime = document.getElementById('toTime');

    if (fromDate && toDate && fromTime && toTime) {
      // Check if dates are empty
      if (!fromDate.value || !toDate.value) {
        // Set default date range (last 24 hours)
        const now = new Date();
        const toDateTimeString = now.toISOString();
        const toDateValue = toDateTimeString.slice(0, 10);
        const toTimeValue = toDateTimeString.slice(11, 19);

        const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const fromDateTimeString = from.toISOString();
        const fromDateValue = fromDateTimeString.slice(0, 10);
        const fromTimeValue = fromDateTimeString.slice(11, 19);

        // Set values
        if (fromDate._flatpickr) {
          fromDate._flatpickr.setDate(fromDateValue, false);
        } else {
          fromDate.value = fromDateValue;
        }
        
        if (toDate._flatpickr) {
          toDate._flatpickr.setDate(toDateValue, false);
        } else {
          toDate.value = toDateValue;
        }
        
        fromTime.value = fromTimeValue;
        toTime.value = toTimeValue;
      }
    }
  }

  /**
   * Get or create container element
   * @param {string|HTMLElement} container - Container selector or element
   * @returns {HTMLElement|null} Container element
   */
  _getContainer(container) {
    if (typeof container === 'string') {
      return document.getElementById(container) || document.querySelector(container);
    } else if (container instanceof HTMLElement) {
      return container;
    } else if (this.currentContainer) {
      return this.currentContainer;
    }
    return null;
  }

  /**
   * Render the complete HTML framework
   * @param {Object} appState - Application state
   * @param {Object} tableState - Table state
   * @returns {string} HTML string
   */
  _renderFramework(appState) {
    return `
      <div class="page-container">
        ${this._renderHeader()}
        ${this._renderFilters(appState)}
        ${this._renderSummaryMetrics()}
        ${this._renderTableSection()}
        ${this._renderTimeControls()}
        ${this._renderOverlays()}
      </div>
    `;
  }

  /**
   * Render the page header
   * @returns {string} Header HTML
   */
  _renderHeader() {
    return `
      <h1 class="page-title">Monitoring by Burcovschi</h1>
    `;
  }

  /**
   * Render the filters panel - EXACTLY as in original
   * @param {Object} appState - Application state
   * @returns {string} Filters HTML
   */
  _renderFilters(appState) {
    const filters = appState.filters || {};
    const dashboardView = appState.dashboardView || {};
    const ui = getUI();
    const showModeControls = !!ui.showModeControls;
    
    // candidate for pure renderer components composition
    return `
      <div id="filters-block" class="filters-panel">
        <div id="customer-filter-item" class="filters-panel__item">
          <input id="customerInput" class="filters-panel__input" type="text" 
                 placeholder="Customer" value="${filters.customer || ''}" />
        </div>
        
        <div id="reverse-button-item" class="filters-panel__item">
          ${renderButton({
            id: 'btnReverse',
            // design system button
            className: 'btn btn--icon',
            title: 'Reverse Customer/Supplier',
            icon: `<svg class="filters-panel__icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`
          })}
        </div>
        
        <div id="supplier-filter-item" class="filters-panel__item">
          <input id="supplierInput" class="filters-panel__input" type="text" 
                 placeholder="Supplier" value="${filters.supplier || ''}" />
        </div>
        
        <div id="destination-filter-item" class="filters-panel__item">
          <input id="destinationInput" class="filters-panel__input" type="text" 
                 placeholder="Destination" value="${filters.destination || ''}" />
        </div>

        <!-- Row break to place group inputs on a second line -->
        <div class="filters-panel__row-sep"></div>

        <div id="customer-group-filter-item" class="filters-panel__item">
          <input id="customerGroupInput" class="filters-panel__input" type="text" 
                 placeholder="Customer group" value="${filters.customerGroup || ''}" />
        </div>

        <div id="supplier-group-filter-item" class="filters-panel__item">
          <input id="supplierGroupInput" class="filters-panel__input" type="text" 
                 placeholder="Supplier group" value="${filters.supplierGroup || ''}" />
        </div>

        <div id="destination-group-filter-item" class="filters-panel__item">
          <input id="destinationGroupInput" class="filters-panel__input" type="text" 
                 placeholder="Destination group" value="${filters.destinationGroup || ''}" />
        </div>
        
        <div class="filters-panel__spacer"></div>
        
        <div class="filters-panel__item filters-panel__item--datetime">
          <div class="filters-panel__input-group">
            <input id="fromDate" class="filters-panel__input date-part" type="text" 
                   title="From Date" value="${filters.from ? filters.from.split(' ')[0] : ''}" />
            <input id="fromTime" class="filters-panel__input time-part" type="time" step="1" 
                   title="From Time" value="${filters.from ? filters.from.split(' ')[1] : ''}" />
          </div>
        </div>
        
        <div class="filters-panel__item filters-panel__item--datetime">
          <div class="filters-panel__input-group">
            <input id="toDate" class="filters-panel__input date-part" type="text" 
                   title="To Date" value="${filters.to ? filters.to.split(' ')[0] : ''}" />
            <input id="toTime" class="filters-panel__input time-part" type="time" step="1" 
                   title="To Time" value="${filters.to ? filters.to.split(' ')[1] : ''}" />
          </div>
        </div>
        
        <div class="filters-panel__spacer"></div>
        
        ${renderButton({ id: 'findButton', className: 'btn btn--primary', text: 'Find' })}

        <div id="tableModeControls" class="filters-panel__control-group" style="${showModeControls ? '' : 'display:none'}">
          <button id="btnSummary" class="btn ${dashboardView.currentMode === 'summary' ? 'active' : ''}">
            Summary Table
          </button>
          <button id="btnCDR" class="btn ${dashboardView.currentMode === 'cdr' ? 'active' : ''}">
            CDR
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render the summary metrics section - EXACTLY as in original
   * @returns {string} Summary metrics HTML
   */
  _renderSummaryMetrics() {
    // Keep summaryMetrics in DOM but hidden so related computations/subscriptions still run
    // Also provide a charts mount right after it
    const ui = getUI();
    const showCharts = !!ui.showCharts;
    return `
      <div id="summaryMetrics" class="summary-display" style="display:none" aria-hidden="true"></div>
      <div id="charts-container" class="charts-container" style="${showCharts ? '' : 'display:none'}">
        <div id="chart-area-1"></div>
      </div>
      <div id="charts-controls" class="charts-toolbar" style="${showCharts ? '' : 'display:none'}"></div>
    `;
  }

  /**
   * Render the table section - EXACTLY as in original
{{ ... }}
   * @param {Object} tableState - Table state
   * @returns {string} Table section HTML
   */
  _renderTableSection() {
    // candidate for pure renderer components composition
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
            <tfoot>
              <tr>
                <td id="table-footer-info" colspan="24"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Render time controls - EXACTLY as in original
   * @returns {string} Time controls HTML
   */
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

  /**
   * Render overlay elements - EXACTLY as in original
   * @returns {string} Overlays HTML
   */
  _renderOverlays() {
    return `
      <div id="pdd-atime-tooltip" class="pdd-atime-tooltip is-hidden"></div>
      <div id="loading-overlay" class="loading-overlay is-hidden"><div class="spinner"></div></div>
      <div id="toast-container" class="toast-container"></div>
    `;
  }

  /**
   * Update filters section based on state
   * @param {Object} appState - Application state
   */
  _updateFilters(appState) {
    const filters = appState.filters || {};
    
    // Helper: update input defensively (do not override user typing)
    const safeSetValue = (input, next) => {
      if (!input) return;
      const isFocused = document.activeElement === input || (typeof input.matches === 'function' && input.matches(':focus'));
      const cur = input.value ?? '';
      const nextVal = next ?? '';
      // Only set if not focused and either empty or truly different due to external change
      if (!isFocused && (cur === '' || cur !== nextVal)) {
        input.value = nextVal;
      }
    };
    const safeSetDate = (input, dateStr) => {
      if (!input) return;
      const isFocused = document.activeElement === input || (typeof input.matches === 'function' && input.matches(':focus'));
      const cur = input.value ?? '';
      const nextVal = dateStr ?? '';
      if (!isFocused && (cur === '' || cur !== nextVal)) {
        if (input._flatpickr) {
          input._flatpickr.setDate(nextVal, false);
        } else {
          input.value = nextVal;
        }
      }
    };

    // Update input values non-destructively
    safeSetValue(document.getElementById('customerInput'), filters.customer || '');
    safeSetValue(document.getElementById('supplierInput'), filters.supplier || '');
    safeSetValue(document.getElementById('destinationInput'), filters.destination || '');

    // Update date/time inputs non-destructively
    if (filters.from) {
      const [fromDate, fromTime] = filters.from.split(' ');
      safeSetDate(document.getElementById('fromDate'), fromDate || '');
      safeSetValue(document.getElementById('fromTime'), fromTime || '');
    }
    if (filters.to) {
      const [toDate, toTime] = filters.to.split(' ');
      safeSetDate(document.getElementById('toDate'), toDate || '');
      safeSetValue(document.getElementById('toTime'), toTime || '');
    }
  }

  /**
   * Update dashboard view controls
   * @param {Object} appState - Application state
   */
  _updateDashboardView(appState) {
    const dashboardView = appState.dashboardView || {};
    
    // Update mode buttons
    const btnSummary = document.getElementById('btnSummary');
    const btnCDR = document.getElementById('btnCDR');
    
    if (btnSummary) btnSummary.classList.toggle('active', dashboardView.currentMode === 'summary');
    if (btnCDR) btnCDR.classList.toggle('active', dashboardView.currentMode === 'cdr');
  }

  /**
   * Update table controls
   * @param {Object} tableState - Table state
   */
  _updateTableControls() {
    // No extra controls to update
  }

  /**
   * Apply state-based styling and classes
   * @param {Object} appState - Application state
   * @param {Object} tableState - Table state
   */
  _applyStateStyling(appState) {
    const preferences = appState.preferences || {};
    
    // Apply theme
    if (preferences.theme) {
      document.body.className = `theme-${preferences.theme}`;
    }
  }

  /**
   * Get the virtualized table container
   * @returns {HTMLElement|null} The virtualized table container
   */
  getVirtualizedTableContainer() {
    return document.getElementById('virtual-scroll-container');
  }

  /**
   * Show the table section
   */
  showTable() {
    const resultsDisplay = document.querySelector('.results-display');
    if (resultsDisplay) {
      resultsDisplay.classList.remove('is-hidden');
    }
  }

  /**
   * Hide the table section
   */
  hideTable() {
    const resultsDisplay = document.querySelector('.results-display');
    if (resultsDisplay) {
      resultsDisplay.classList.add('is-hidden');
    }
  }

  /**
   * Destroy the renderer
   */
  destroy() {
    this.currentContainer = null;
    this.isInitialized = false;
  }

  /**
   * Save current filter values from the rendered filters panel
   * @param {HTMLElement} container - The container element containing the filters
   * @returns {Object|null} An object containing current filter values, or null if not found
   */
  _saveCurrentFilterValues(container) {
    
    const filtersBlock = container.querySelector('#filters-block');
    
    if (!filtersBlock) {
      return null;
    }

    const customerInput = filtersBlock.querySelector('#customerInput');
    const supplierInput = filtersBlock.querySelector('#supplierInput');
    const destinationInput = filtersBlock.querySelector('#destinationInput');
    const customerGroupInput = filtersBlock.querySelector('#customerGroupInput');
    const supplierGroupInput = filtersBlock.querySelector('#supplierGroupInput');
    const destinationGroupInput = filtersBlock.querySelector('#destinationGroupInput');
    const fromDateInput = filtersBlock.querySelector('#fromDate');
    const toDateInput = filtersBlock.querySelector('#toDate');
    const fromTimeInput = filtersBlock.querySelector('#fromTime');
    const toTimeInput = filtersBlock.querySelector('#toTime');

    const currentFilterValues = {};
    if (customerInput) currentFilterValues.customer = customerInput.value;
    if (supplierInput) currentFilterValues.supplier = supplierInput.value;
    if (destinationInput) currentFilterValues.destination = destinationInput.value;
    if (customerGroupInput) currentFilterValues.customerGroup = customerGroupInput.value;
    if (supplierGroupInput) currentFilterValues.supplierGroup = supplierGroupInput.value;
    if (destinationGroupInput) currentFilterValues.destinationGroup = destinationGroupInput.value;
    if (fromDateInput) currentFilterValues.from = `${fromDateInput.value} ${fromTimeInput ? fromTimeInput.value : ''}`;
    if (toDateInput) currentFilterValues.to = `${toDateInput.value} ${toTimeInput ? toTimeInput.value : ''}`;

    return currentFilterValues;
  }

  /**
   * Restore filter values to the rendered filters panel
   * @param {HTMLElement} container - The container element containing the filters
   * @param {Object} values - An object containing filter values to restore
   */
  _restoreFilterValues(container, values) {
    
    const filtersBlock = container.querySelector('#filters-block');
    
    if (!filtersBlock) {
      return;
    }

    const customerInput = filtersBlock.querySelector('#customerInput');
    const supplierInput = filtersBlock.querySelector('#supplierInput');
    const destinationInput = filtersBlock.querySelector('#destinationInput');
    const customerGroupInput = filtersBlock.querySelector('#customerGroupInput');
    const supplierGroupInput = filtersBlock.querySelector('#supplierGroupInput');
    const destinationGroupInput = filtersBlock.querySelector('#destinationGroupInput');
    const fromDateInput = filtersBlock.querySelector('#fromDate');
    const toDateInput = filtersBlock.querySelector('#toDate');
    const fromTimeInput = filtersBlock.querySelector('#fromTime');
    const toTimeInput = filtersBlock.querySelector('#toTime');

    if (customerInput) customerInput.value = values.customer || '';
    if (supplierInput) supplierInput.value = values.supplier || '';
    if (destinationInput) destinationInput.value = values.destination || '';
    if (customerGroupInput) customerGroupInput.value = values.customerGroup || '';
    if (supplierGroupInput) supplierGroupInput.value = values.supplierGroup || '';
    if (destinationGroupInput) destinationGroupInput.value = values.destinationGroup || '';
    
    if (fromDateInput && values.from) {
      const [fromDate, fromTime] = values.from.split(" ");
      
      if (fromDateInput._flatpickr) {
        fromDateInput._flatpickr.setDate(fromDate, false);
      } else {
        fromDateInput.value = fromDate || '';
      }
      
      if (fromTimeInput) {
        fromTimeInput.value = fromTime || '';
      }
    }
    
    if (toDateInput && values.to) {
      const [toDate, toTime] = values.to.split(" ");
      
      if (toDateInput._flatpickr) {
        toDateInput._flatpickr.setDate(toDate, false);
      } else {
        toDateInput.value = toDate || '';
      }
      
      if (toTimeInput) {
        toTimeInput.value = toTime || '';
      }
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
