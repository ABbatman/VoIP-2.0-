// Virtual Table Adapter Module - Single Responsibility: Bridge Virtual Scroller with Table System
// Localized comments in English as requested

import { VirtualScroller } from './virtual-scroller.js';
import { getContainer, getSpacer, getTbody, getTable } from './selectors/dom-selectors.js';
import { parseNum, computeDeltaPercent, pickDeltaDisplay, formatMetricValue, getAnomalyClass } from '../utils/metrics.js';

/**
 * Virtual Table Adapter
 * Responsibility: Bridge between virtual scroller and existing table rendering system
 */
export class VirtualTableAdapter {
  constructor() {
    this.virtualScroller = null;
    this.isActive = false;
    this.domUpdateCallback = null;
  }

  /**
   * Initialize virtual table with existing DOM structure
   */
  initialize() {
    const container = getContainer();
    const spacer = getSpacer();
    const tbody = getTbody();
    const table = getTable();

    if (!container || !spacer || !tbody || !table) {
      console.warn('Virtual Table Adapter: Required DOM elements not found');
      return false;
    }

    this.virtualScroller = new VirtualScroller({
      container,
      spacer,
      tbody,
      table,
      rowHeight: 40,
      bufferSize: 5,
      renderRow: (rowData) => this.renderTableRow(rowData),
      onDOMUpdate: () => this.onDOMUpdated()
    });

    const initialized = this.virtualScroller.initialize();
    this.isActive = initialized;
    
    return initialized;
  }

  /**
   * Set callback for DOM updates
   */
  setDOMUpdateCallback(callback) {
    this.domUpdateCallback = callback;
  }

  /**
   * Called when virtual scroller updates DOM
   */
  onDOMUpdated() {
    if (this.domUpdateCallback) {
      this.domUpdateCallback();
    }
  }

  /**
   * Set data for virtual rendering
   */
  setData(data) {
    if (!this.virtualScroller) {
      console.warn('Virtual Table Adapter: Not initialized');
      return false;
    }

    this.virtualScroller.setData(data);
    try { this.virtualScroller.render(true); } catch (_) { /* no-op */ }
    return true;
  }

  /**
   * Force immediate re-render (for toggle operations)
   */
  forceRender() {
    if (!this.virtualScroller) {
      console.warn('Virtual Table Adapter: Not initialized');
      return false;
    }
    

    this.virtualScroller.render(true); // forceRender = true
    return true;
  }

  /**
   * Render a single table row - integrates with existing table styling and tooltips
   */
  renderTableRow(rowData) {
    // IMPORTANT: VirtualScroller creates the <tr> element and sets its innerHTML.
    // Therefore, this method must return ONLY the inner <td> cells, not a full <tr>.
    const cells = this.generateRowCells(rowData);
    return cells.join('');
  }

  /**
   * Get CSS class for row based on its type
   */
  getRowClass(rowData) {
    if (rowData.level === 0) return 'main-row';
    if (rowData.level === 1) return 'peer-row';
    if (rowData.level === 2) return 'hour-row';
    return '';
  }

  /**
   * Generate all cells for a row
   */
  generateRowCells(rowData) {
    const cells = [];

    if (rowData.level === 0) {
      // Main row
      cells.push(this.generateMainRowHTML(rowData));
    } else if (rowData.level === 1) {
      // Peer row
      cells.push(this.generatePeerRowHTML(rowData));
    } else if (rowData.level === 2) {
      // Hourly row
      cells.push(this.generateHourlyRowHTML(rowData));
    }

    return cells;
  }

  /**
   * Generate main row HTML
   */
  generateMainRowHTML(rowData) {
    const metricCells = this.generateMetricCells(rowData);
    
    const toggleBtn = `<button class="toggle-btn" data-target-group="${rowData.groupId}">+</button>`;
    

    
    return [
      `<td role="cell" class="main-cell" data-filter-value="${rowData.main || ''}">${toggleBtn} ${rowData.main || ''}</td>`,
      `<td role="cell" class="peer-cell" data-filter-value=""></td>`, // Empty for main rows
      `<td role="cell" class="destination-cell" data-filter-value="${rowData.destination || ''}">${rowData.destination || ''}</td>`,
      ...metricCells
    ].join('');
  }

  /**
   * Generate peer row HTML
   */
  generatePeerRowHTML(rowData) {
    const metricCells = this.generateMetricCells(rowData);
    
    // Default to '+' (collapsed), will be updated by updateAllToggleButtons
    const toggleBtn = `<button class="toggle-btn" data-target-group="${rowData.groupId}">+</button>`;
    
    return [
      `<td role="cell" class="toggle-cell"></td>`,
      `<td role="cell" class="peer-cell" data-filter-value="${rowData.peer || ''}">${toggleBtn} ${rowData.peer || ''}</td>`,
      `<td role="cell" class="destination-cell" data-filter-value="${rowData.destination || ''}">${rowData.destination || ''}</td>`,
      ...metricCells
    ].join('');
  }

  /**
   * Generate hourly row HTML
   */
  generateHourlyRowHTML(rowData) {
    const metricCells = this.generateMetricCells(rowData);
    const timeKey = this.formatDateToKey(rowData.date);
    const dateKey = this.formatDateToDateKey(rowData.date);
    
    return [
      `<td role="cell" class="main-cell hour-datetime" data-filter-value="${dateKey} ${timeKey}">
        <div class="hour-datetime-inner">
          <span class="date-part">${dateKey}</span>
          <span class="time-part">${timeKey}</span>
        </div>
      </td>`, // Date left, time right in same cell (wrapped to prevent overflow)
      `<td role="cell" class="peer-cell" data-filter-value="${rowData.peer || ''}">${rowData.peer || ''}</td>`, // ✅ Show peer name in hourly rows
      `<td role="cell" class="destination-cell" data-filter-value="${rowData.destination || ''}">${rowData.destination || ''}</td>`,
      ...metricCells
    ].join('');
  }

  /**
   * Format date to time key (HH:MM)
   */
  formatDateToKey(date) {
    if (!date) return '00:00';
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Format date to date key (DD:MM:YYYY)
   */
  formatDateToDateKey(date) {
    if (!date) return '00:00:0000';
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}:${month}:${year}`;
  }

  /**
   * Generate metric cells with correct order and tooltip support
   */
  generateMetricCells(rowData) {
    const metrics = ["Min", "ACD", "ASR", "SCall", "TCall"];
    const cells = [];



    metrics.forEach((metricName) => {
      const valueNum = parseNum(rowData[metricName]);
      const yNum = parseNum(rowData[`Y${metricName}`]);
      const providedDelta = rowData[`${metricName}_delta`];

      const deltaPercent = computeDeltaPercent(valueNum, yNum);
      const anomalyClass = getAnomalyClass(metricName, valueNum, yNum, deltaPercent);

      // Main value cell with special handling for ASR (tooltips)
      let mainCellClass = `metric-cell ${anomalyClass}`;
      let mainCellAttributes = '';
      if (metricName === 'ASR') {
        mainCellClass += ' asr-cell-hover';
        // Compute average ATime per successful call if possible
        let atimeAvgStr = 'N/A';
        const atimeNum = parseNum(rowData.ATime);
        const sCallNum = parseNum(rowData.SCall);
        if (Number.isFinite(atimeNum) && Number.isFinite(sCallNum) && sCallNum > 0) {
          const avg = atimeNum / sCallNum;
          atimeAvgStr = Number.isFinite(avg) ? avg.toFixed(2) : 'N/A';
        } else if (Number.isFinite(atimeNum)) {
          atimeAvgStr = atimeNum.toFixed(2);
        }
        mainCellAttributes = `data-pdd="${rowData.PDD || 'N/A'}" data-atime="${atimeAvgStr}"`;
      }

      const displayValue = formatMetricValue(metricName, rowData[metricName]);
      cells.push(`<td role="cell" class="${mainCellClass}" ${mainCellAttributes}>${displayValue}</td>`);

      const displayYValue = formatMetricValue(metricName, rowData[`Y${metricName}`]);
      cells.push(`<td role="cell" class="metric-cell" data-y-toggleable="true">${displayYValue}</td>`);

      const { display: deltaDisplay, className: deltaClass } = pickDeltaDisplay(rowData[metricName], rowData[`Y${metricName}`], providedDelta);
      cells.push(`<td role="cell" class="metric-cell delta-cell ${deltaClass}">${deltaDisplay}</td>`);
    });

    return cells;
  }

  /**
   * Get anomaly CSS class for metric cell
   */
  // getAnomalyClass method removed: using imported utility getAnomalyClass from '../utils/metrics.js'

  /**
   * Get current status
   */
  getStatus() {
    return {
      active: this.isActive,
      scroller: this.virtualScroller ? this.virtualScroller.getStatus() : null
    };
  }

  /**
   * Destroy virtual table adapter
   */
  destroy() {
    if (this.virtualScroller) {
      this.virtualScroller.destroy();
      this.virtualScroller = null;
    }
    this.isActive = false;
  }
}

