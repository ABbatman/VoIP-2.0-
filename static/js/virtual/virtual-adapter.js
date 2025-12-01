// static/js/virtual/virtual-adapter.js
// Responsibility: Bridge VirtualScroller with table rendering system

import { VirtualScroller } from './virtual-scroller.js';
import { isMainExpanded, isPeerExpanded } from '../state/expansionState.js';
import { getContainer, getSpacer, getTbody, getTable } from './selectors/dom-selectors.js';
import { parseNum, computeDeltaPercent, pickDeltaDisplay, formatMetricValue, getAnomalyClass } from '../utils/metrics.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_BUFFER_SIZE = 5;
const METRICS = ['Min', 'ACD', 'ASR', 'SCall', 'TCall'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const pad2 = n => String(n).padStart(2, '0');
const escapeAttr = v => (v ?? '').toString();

function formatTime(date) {
  if (!date) return '00:00';
  const d = new Date(date);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDate(date) {
  if (!date) return '00:00:0000';
  const d = new Date(date);
  return `${pad2(d.getDate())}:${pad2(d.getMonth() + 1)}:${d.getFullYear()}`;
}

function toggleBtn(groupId, expanded) {
  return `<button class="toggle-btn" data-target-group="${groupId}">${expanded ? '−' : '+'}</button>`;
}

function cell(cls, filterVal, content, attrs = '') {
  const fv = escapeAttr(filterVal);
  return `<td role="cell" class="${cls}" data-filter-value="${fv}" data-full-text="${fv}" ${attrs}>${content}</td>`;
}

// ─────────────────────────────────────────────────────────────
// Class
// ─────────────────────────────────────────────────────────────

export class VirtualTableAdapter {
  constructor() {
    this.virtualScroller = null;
    this.isActive = false;
    this.domUpdateCallback = null;
  }

  initialize() {
    const container = getContainer();
    const spacer = getSpacer();
    const tbody = getTbody();
    const table = getTable();

    if (!container || !spacer || !tbody || !table) {
      logError(ErrorCategory.TABLE, 'virtualAdapter:init', 'Missing required DOM elements');
      return false;
    }

    this.virtualScroller = new VirtualScroller({
      container, spacer, tbody, table,
      rowHeight: DEFAULT_ROW_HEIGHT,
      bufferSize: DEFAULT_BUFFER_SIZE,
      renderRow: rowData => this.renderTableRow(rowData),
      onDOMUpdate: () => this.domUpdateCallback?.()
    });

    this.isActive = this.virtualScroller.initialize();
    return this.isActive;
  }

  setDOMUpdateCallback(callback) { this.domUpdateCallback = callback; }

  setData(data) {
    if (!this.virtualScroller) return false;
    this.virtualScroller.setData(data);
    try { this.virtualScroller.render(true); } catch (e) { logError(ErrorCategory.TABLE, 'virtualAdapter:setData', e); }
    return true;
  }

  forceRender() {
    if (!this.virtualScroller) return false;
    this.virtualScroller.render(true);
    return true;
  }

  renderTableRow(rowData) {
    if (rowData.level === 0) return this._mainRowHTML(rowData);
    if (rowData.level === 1) return this._peerRowHTML(rowData);
    if (rowData.level === 2) return this._hourlyRowHTML(rowData);
    return '';
  }

  // ─────────────────────────────────────────────────────────────
  // Row HTML generators
  // ─────────────────────────────────────────────────────────────

  _mainRowHTML(r) {
    const btn = toggleBtn(r.groupId, isMainExpanded(r.groupId));
    return [
      cell('main-cell', r.main, `${btn} ${r.main || ''}`),
      `<td role="cell" class="peer-cell" data-filter-value=""></td>`,
      cell('destination-cell', r.destination, r.destination || ''),
      ...this._metricCells(r)
    ].join('');
  }

  _peerRowHTML(r) {
    const btn = toggleBtn(r.groupId, isPeerExpanded(r.groupId));
    return [
      `<td role="cell" class="toggle-cell"></td>`,
      cell('peer-cell', r.peer, `${btn} ${r.peer || ''}`),
      cell('destination-cell', r.destination, r.destination || ''),
      ...this._metricCells(r)
    ].join('');
  }

  _hourlyRowHTML(r) {
    const time = formatTime(r.date);
    const date = formatDate(r.date);
    return [
      `<td role="cell" class="main-cell hour-datetime" data-filter-value="${date} ${time}">
        <div class="hour-datetime-inner"><span class="date-part">${date}</span><span class="time-part">${time}</span></div>
      </td>`,
      cell('peer-cell', r.peer, r.peer || ''),
      cell('destination-cell', r.destination, r.destination || ''),
      ...this._metricCells(r)
    ].join('');
  }

  // ─────────────────────────────────────────────────────────────
  // Metric cells
  // ─────────────────────────────────────────────────────────────

  _metricCells(r) {
    const cells = [];

    for (const m of METRICS) {
      const val = parseNum(r[m]);
      const yVal = parseNum(r[`Y${m}`]);
      const delta = computeDeltaPercent(val, yVal);
      const anomaly = getAnomalyClass(m, val, yVal, delta);

      let cls = `metric-cell ${anomaly}`;
      let attrs = '';

      if (m === 'ASR') {
        cls += ' asr-cell-hover';
        const atime = parseNum(r.ATime);
        const scall = parseNum(r.SCall);
        const avg = (Number.isFinite(atime) && Number.isFinite(scall) && scall > 0)
          ? (atime / scall).toFixed(2)
          : (Number.isFinite(atime) ? atime.toFixed(2) : 'N/A');
        attrs = `data-pdd="${r.PDD || 'N/A'}" data-atime="${avg}"`;
      }

      cells.push(`<td role="cell" class="${cls}" ${attrs}>${formatMetricValue(m, r[m])}</td>`);
      cells.push(`<td role="cell" class="metric-cell" data-y-toggleable="true">${formatMetricValue(m, r[`Y${m}`])}</td>`);

      const { display, className } = pickDeltaDisplay(r[m], r[`Y${m}`], r[`${m}_delta`]);
      cells.push(`<td role="cell" class="metric-cell delta-cell ${className}">${display}</td>`);
    }

    return cells;
  }

  getStatus() {
    return { active: this.isActive, scroller: this.virtualScroller?.getStatus() ?? null };
  }

  destroy() {
    this.virtualScroller?.destroy();
    this.virtualScroller = null;
    this.isActive = false;
  }
}

