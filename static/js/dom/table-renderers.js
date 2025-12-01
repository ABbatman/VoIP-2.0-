// static/js/dom/table-renderers.js
// Responsibility: Table row rendering (string and DOM)
import { getAnomalyClass } from '../utils/helpers.js';
import { getColumnConfig } from './table-ui.js';
import { generateSparkbar } from '../visualEnhancements/microCharts.js';
import { getHeatmapStyle } from '../visualEnhancements/heatmapStyling.js';
import { getHierarchyVisuals, getHierarchyIndent, injectHierarchyStyles } from '../visualEnhancements/hierarchyGuides.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const METRICS = ['Min', 'ACD', 'ASR', 'SCall', 'TCall'];
// use Set for O(1) lookup
const NO_ANOMALY_METRICS_SET = new Set(['Min', 'SCall', 'TCall']);
const SPARKBAR_METRICS_SET = new Set(['ASR', 'ACD']);
const SPARKBAR_MAX = { ASR: 100, ACD: 30 };
const SPARKBAR_OPTS = { width: 24, height: 4, color: 'rgba(0,0,0,0.2)', bgColor: 'rgba(0,0,0,0.05)' };

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_5MIN = 5 * 60 * 1000;
const FIVE_MIN_THRESHOLD = 30 * 60 * 1000;

// inject hierarchy styles once
try { injectHierarchyStyles(); } catch (e) { logError(ErrorCategory.TABLE, 'tableRenderers:init', e); }

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// pre-compiled regex for escapeHtml (avoid recreating on each call)
const ESCAPE_REGEX = /[&<>"']/g;
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(str) {
  const s = String(str);
  // fast path: no special chars
  if (!ESCAPE_REGEX.test(s)) return s;
  ESCAPE_REGEX.lastIndex = 0; // reset regex state
  return s.replace(ESCAPE_REGEX, ch => ESCAPE_MAP[ch]);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDateToKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
}

function formatDateFull(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCellValue(metric, val) {
  if (val === '' || val == null) return '-';

  const toOneDecimal = n => Number.isInteger(n) ? String(n) : n.toFixed(1);

  if (typeof val === 'number') {
    if (metric === 'Min') return String(Math.round(val));
    if (metric === 'ACD' || metric === 'ASR') return toOneDecimal(val);
    return String(val);
  }

  const n = parseFloat(val);
  if (!isNaN(n)) {
    if (metric === 'Min') return String(Math.round(n));
    if (metric === 'ACD' || metric === 'ASR') return toOneDecimal(n);
    return String(n);
  }

  return escapeHtml(String(val));
}

function calcDeltaPercent(value, yesterdayValue) {
  if (typeof value === 'number' && typeof yesterdayValue === 'number' && yesterdayValue !== 0) {
    return ((value - yesterdayValue) / Math.abs(yesterdayValue)) * 100;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Legacy DOM creators (deprecated)
// ─────────────────────────────────────────────────────────────

function createCell(content) {
  const td = document.createElement('td');
  td.textContent = (content === '' || content == null) ? '-' : String(content);
  return td;
}
export function createMainRow(mainRow, groupId) {
  const tr = document.createElement("tr");
  tr.classList.add("main-row");
  const mainCell = document.createElement("td");
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "toggle-btn";
  toggleBtn.textContent = "+";
  toggleBtn.dataset.targetGroup = groupId;
  mainCell.appendChild(toggleBtn);
  mainCell.appendChild(document.createTextNode(` ${mainRow.main}`));
  mainCell.dataset.filterValue = mainRow.main;
  tr.appendChild(mainCell);
  tr.appendChild(createCell(""));
  tr.appendChild(createCell(mainRow.destination));
  addMetricCells(tr, mainRow);
  return tr;
}
export function createPeerRow(peerRow, mainGroupId, peerGroupId) {
  const tr = document.createElement("tr");
  tr.classList.add("peer-row");
  tr.dataset.group = mainGroupId;
  tr.style.display = "none";
  tr.appendChild(createCell(""));
  const peerCell = document.createElement("td");
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "toggle-btn";
  toggleBtn.textContent = "+";
  toggleBtn.dataset.targetGroup = peerGroupId;
  peerCell.appendChild(toggleBtn);
  peerCell.appendChild(document.createTextNode(` ${peerRow.peer}`));
  peerCell.dataset.filterValue = peerRow.peer;
  tr.appendChild(peerCell);
  tr.appendChild(createCell(peerRow.destination));
  addMetricCells(tr, peerRow);
  return tr;
}
export function createHourlyRows(relevantHours, peerGroupId, parentPeerRow) {
  if (relevantHours.length === 0) return [];
  const hourDataMap = new Map(relevantHours.map((h) => [h.time, h]));
  const times = relevantHours.map((h) => new Date(h.time).getTime());
  const minTime = new Date(Math.min(...times));
  const maxTime = new Date(Math.max(...times));
  const generatedRows = [];
  const metricColumns = getColumnConfig().slice(3);
  for (let d = new Date(minTime); d <= maxTime; d.setHours(d.getHours() + 1)) {
    const hourKey = formatDateToKey(d);
    const dataForThisHour = hourDataMap.get(hourKey);
    const tr = document.createElement("tr");
    tr.classList.add("hour-row");
    tr.dataset.group = peerGroupId;
    tr.style.display = "none";
    const datetimeTd = document.createElement("td");
    const container = document.createElement("div");
    container.className = "datetime-cell-container";
    const [datePart, timePart] = hourKey.split(" ");
    const dateSpan = document.createElement("span");
    dateSpan.className = "date-part";
    dateSpan.textContent = datePart;
    const timeSpan = document.createElement("span");
    timeSpan.className = "time-part";
    timeSpan.textContent = timePart;
    container.appendChild(dateSpan);
    container.appendChild(timeSpan);
    datetimeTd.appendChild(container);
    datetimeTd.dataset.filterValue = datePart;
    tr.appendChild(datetimeTd);
    const peerCell = createCell(parentPeerRow.peer);
    peerCell.dataset.filterValue = parentPeerRow.peer;
    tr.appendChild(peerCell);
    const destCell = createCell(parentPeerRow.destination);
    destCell.dataset.filterValue = parentPeerRow.destination;
    tr.appendChild(destCell);
    if (dataForThisHour) {
      addMetricCells(tr, dataForThisHour);
    } else {
      metricColumns.forEach((col) => {
        const td = createCell("-");
        if (col.isYColumn) {
          td.dataset.yToggleable = "true";
        }
        tr.appendChild(td);
      });
    }
    generatedRows.push(tr);
  }
  return generatedRows;
}

function addMetricCells(tr, rowData) {
  METRICS.forEach(metric => {
    const value = rowData[metric];
    const yesterdayValue = rowData[`Y${metric}`];
    const delta = rowData[`${metric}_delta`];
    const deltaPercent = calcDeltaPercent(value, yesterdayValue);

    // main cell
    const tdMain = createCell(value);
    if (!NO_ANOMALY_METRICS_SET.has(metric)) {
      tdMain.className = getAnomalyClass({ key: metric, value, yesterdayValue, deltaPercent });
    }
    if (metric === 'ASR') {
      tdMain.classList.add('asr-cell-hover');
      tdMain.dataset.pdd = rowData.PDD ?? 'N/A';
      tdMain.dataset.atime = rowData.ATime ?? 'N/A';
    }
    tr.appendChild(tdMain);

    // yesterday cell
    const tdY = createCell(yesterdayValue);
    tdY.dataset.yToggleable = 'true';
    tr.appendChild(tdY);

    // delta cell
    const tdDelta = document.createElement('td');
    if (typeof delta === 'number' && delta !== 0) {
      tdDelta.textContent = Math.abs(delta).toFixed(1);
      tdDelta.classList.add(delta > 0 ? 'cell-positive' : 'cell-negative');
    } else {
      tdDelta.textContent = '-';
    }
    tr.appendChild(tdDelta);
  });
}

// ─────────────────────────────────────────────────────────────
// String renderers (pure HTML)
// ─────────────────────────────────────────────────────────────

export function renderMainRowString(mainRow, { mainGroupId, isMainGroupOpen }) {
  const toggle = isMainGroupOpen ? '−' : '+';
  const guideClass = getHierarchyVisuals('main');

  return `<tr class="main-row ${guideClass}">
    <td data-filter-value="${escapeHtml(mainRow.main)}"><button type="button" class="toggle-btn" data-target-group="${mainGroupId}">${toggle}</button> ${escapeHtml(mainRow.main)}</td>
    <td></td>
    <td>${escapeHtml(mainRow.destination)}</td>
    ${renderMetricCellsString(mainRow)}
  </tr>`;
}

export function renderPeerRowString(peerRow, { mainGroupId, peerGroupId, isMainGroupOpen, isPeerGroupOpen }) {
  const toggle = isPeerGroupOpen ? '−' : '+';
  const guideClass = getHierarchyVisuals('peer');
  const indentStyle = getHierarchyIndent('peer');
  const classes = ['peer-row', guideClass];
  if (!isMainGroupOpen) classes.push('is-hidden');

  return `<tr class="${classes.join(' ')}" data-group="${mainGroupId}">
    <td></td>
    <td data-filter-value="${escapeHtml(peerRow.peer)}" style="${indentStyle}"><button type="button" class="toggle-btn" data-target-group="${peerGroupId}">${toggle}</button> ${escapeHtml(peerRow.peer)}</td>
    <td data-filter-value="${escapeHtml(peerRow.destination)}">${escapeHtml(peerRow.destination)}</td>
    ${renderMetricCellsString(peerRow)}
  </tr>`;
}

export function renderHourlyRowsString(relevantHours, { peerGroupId, isMainGroupOpen, isPeerGroupOpen, parentPeer }) {
  if (!Array.isArray(relevantHours) || !relevantHours.length) return '';

  const hourDataMap = new Map(relevantHours.map(h => [h.time, h]));
  const times = relevantHours.map(h => new Date(h.time).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  // detect 5-min vs hourly granularity
  const sorted = Array.from(new Set(times)).sort((a, b) => a - b);
  let minDiff = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff > 0 && diff < minDiff) minDiff = diff;
  }
  const isFiveMin = minDiff < FIVE_MIN_THRESHOLD;
  const stepMs = isFiveMin ? MS_PER_5MIN : MS_PER_HOUR;

  const metricCols = getColumnConfig().slice(3);
  const visible = isMainGroupOpen && isPeerGroupOpen;
  const guideClass = getHierarchyVisuals('hour');
  const indentStyle = getHierarchyIndent('hour');

  let html = '';

  for (let t = minTime; t <= maxTime; t += stepMs) {
    const d = new Date(t);
    const key = isFiveMin ? formatDateFull(d) : formatDateToKey(d);
    const [datePart, timePart] = key.split(' ');
    const rowData = hourDataMap.get(key);

    const classes = ['hour-row', guideClass];
    if (!visible) classes.push('is-hidden');

    html += `<tr class="${classes.join(' ')}" data-group="${peerGroupId}">`;
    html += `<td data-filter-value="${escapeHtml(datePart)}" style="${indentStyle}"><div class="datetime-cell-container"><span class="date-part">${escapeHtml(datePart)}</span><span class="time-part">${escapeHtml(timePart)}</span></div></td>`;
    html += `<td data-filter-value="${escapeHtml(parentPeer.peer)}">${escapeHtml(parentPeer.peer)}</td>`;
    html += `<td data-filter-value="${escapeHtml(parentPeer.destination)}">${escapeHtml(parentPeer.destination)}</td>`;

    if (rowData) {
      html += renderMetricCellsString(rowData);
    } else {
      metricCols.forEach(col => {
        const yAttr = col.isYColumn ? ' data-y-toggleable="true"' : '';
        html += `<td${yAttr}>-</td>`;
      });
    }
    html += '</tr>';
  }

  return html;
}

function renderMetricCellsString(rowData) {
  let html = '';

  METRICS.forEach(metric => {
    const value = rowData[metric];
    const yesterdayValue = rowData[`Y${metric}`];
    const delta = rowData[`${metric}_delta`];
    const deltaPercent = calcDeltaPercent(value, yesterdayValue);

    // main cell
    const cls = NO_ANOMALY_METRICS_SET.has(metric) ? '' : getAnomalyClass({ key: metric, value, yesterdayValue, deltaPercent });
    const heatmap = getHeatmapStyle(metric, value);
    const styleAttr = heatmap ? ` style="${heatmap}"` : '';

    // sparkbar for ASR/ACD
    let microChart = '';
    if (typeof value === 'number' && SPARKBAR_METRICS_SET.has(metric)) {
      microChart = generateSparkbar(value, SPARKBAR_MAX[metric], SPARKBAR_OPTS);
    }

    if (metric === 'ASR') {
      const classes = [cls, 'asr-cell-hover'].filter(Boolean).join(' ');
      html += `<td class="${classes}" data-pdd="${escapeHtml(rowData.PDD ?? 'N/A')}" data-atime="${escapeHtml(rowData.ATime ?? 'N/A')}"${styleAttr}>${formatCellValue(metric, value)}${microChart}</td>`;
    } else {
      html += `<td${cls ? ` class="${cls}"` : ''}${styleAttr}>${formatCellValue(metric, value)}${microChart}</td>`;
    }

    // yesterday cell
    html += `<td data-y-toggleable="true">${formatCellValue(metric, yesterdayValue)}</td>`;

    // delta cell
    if (typeof delta === 'number' && delta !== 0) {
      const deltaCls = delta > 0 ? 'cell-positive' : 'cell-negative';
      html += `<td class="${deltaCls}">${Math.abs(delta).toFixed(1)}</td>`;
    } else {
      html += '<td>-</td>';
    }
  });

  return html;
}
