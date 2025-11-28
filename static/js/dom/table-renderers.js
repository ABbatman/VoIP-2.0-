// static/js/dom/table-renderers.js
// This module contains functions responsible for creating the HTML elements for the table.

// --- MODIFIED: Corrected the import path ---
import { getAnomalyClass } from "../utils/helpers.js";
import { getColumnConfig } from "./table-ui.js";
import { generateSparkline, generateSparkbar } from "../visualEnhancements/microCharts.js";
import { getHeatmapStyle } from "../visualEnhancements/heatmapStyling.js";
import { getHierarchyVisuals, getHierarchyIndent, injectHierarchyStyles } from "../visualEnhancements/hierarchyGuides.js";
import { logError, ErrorCategory } from "../utils/errorLogger.js";

// Inject styles once
try { injectHierarchyStyles(); } catch (e) { logError(ErrorCategory.TABLE, 'tableRenderers', e); }

// --- Row Creation Functions (legacy DOM creators) ---
// deprecated: prefer string renderers (renderMainRowString/renderPeerRowString/renderHourlyRowsString)
function createCell(content) {
  const td = document.createElement('td');
  if (content === '' || content == null) {
    td.textContent = '-';
  } else {
    td.textContent = String(content);
  }
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

// --- Generic Helper Functions ---

/**
 * Creates and appends all metric-related cells for a given data row.
 * @param {HTMLTableRowElement} tr - The table row to append cells to.
 * @param {Object} rowData - The data object for the current row.
 */
function addMetricCells(tr, rowData) {
  const metrics = ["Min", "ACD", "ASR", "SCall", "TCall"];

  metrics.forEach((metricName) => {
    const value = rowData[metricName];
    const yesterdayValue = rowData[`Y${metricName}`];
    const delta = rowData[`${metricName}_delta`];
    let deltaPercent = null;
    if (
      typeof value === "number" &&
      typeof yesterdayValue === "number" &&
      yesterdayValue !== 0
    ) {
      deltaPercent = ((value - yesterdayValue) / Math.abs(yesterdayValue)) * 100;
    }

    // main metric cell
    const tdMain = createCell(value);
    const shouldDisable = metricName === "Min" || metricName === "SCall" || metricName === "TCall";
    tdMain.className = shouldDisable ? "" : getAnomalyClass({
      key: metricName,
      value,
      yesterdayValue,
      deltaPercent,
    });
    if (metricName === "ASR") {
      tdMain.classList.add("asr-cell-hover");
      tdMain.dataset.pdd = rowData.PDD ?? "N/A";
      tdMain.dataset.atime = rowData.ATime ?? "N/A";
    }
    tr.appendChild(tdMain);

    // yesterday cell
    const tdYesterday = createCell(yesterdayValue);
    tdYesterday.dataset.yToggleable = "true";
    tr.appendChild(tdYesterday);

    // delta cell
    const tdDelta = document.createElement("td");
    if (typeof delta === "number" && delta !== 0) {
      const absDelta = Math.abs(delta);
      tdDelta.textContent = absDelta.toFixed(1);
      if (delta > 0) tdDelta.classList.add("cell-positive");
      else tdDelta.classList.add("cell-negative");
    } else {
      tdDelta.textContent = "-";
    }
    tr.appendChild(tdDelta);
  });
}

function formatDateToKey(d) {
  const pad = (num) => num.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
}

// ================== STRING RENDERERS (PURE) ==================
// Return HTML strings only (no DOM nodes, no event handlers)

/**
 * Render main row as HTML string
 */
export function renderMainRowString(mainRow, { mainGroupId, isMainGroupOpen }) {
  const toggle = isMainGroupOpen ? '−' : '+';
  const guideClass = getHierarchyVisuals('main');
  let html = `<tr class="main-row ${guideClass}">`;
  html += `<td data-filter-value="${escapeHtml(mainRow.main)}"><button type="button" class="toggle-btn" data-target-group="${mainGroupId}">${toggle}</button> ${escapeHtml(mainRow.main)}</td>`;
  html += `<td></td>`;
  html += `<td>${escapeHtml(mainRow.destination)}</td>`;
  html += renderMetricCellsString(mainRow);
  html += `</tr>`;
  return html;
}

/**
 * Render peer row as HTML string
 */
export function renderPeerRowString(peerRow, { mainGroupId, peerGroupId, isMainGroupOpen, isPeerGroupOpen }) {
  const toggle = isPeerGroupOpen ? '−' : '+';
  // Use class-based visibility to allow runtime toggles to work reliably
  const guideClass = getHierarchyVisuals('peer');
  const indentStyle = getHierarchyIndent('peer');
  const rowClasses = ['peer-row', guideClass];
  if (!isMainGroupOpen) rowClasses.push('is-hidden');
  let html = `<tr class="${rowClasses.join(' ')}" data-group="${mainGroupId}">`;
  html += `<td></td>`;
  html += `<td data-filter-value="${escapeHtml(peerRow.peer)}" style="${indentStyle}"><button type="button" class="toggle-btn" data-target-group="${peerGroupId}">${toggle}</button> ${escapeHtml(peerRow.peer)}</td>`;
  html += `<td data-filter-value="${escapeHtml(peerRow.destination)}">${escapeHtml(peerRow.destination)}</td>`;
  html += renderMetricCellsString(peerRow);
  html += `</tr>`;
  return html;
}

/**
 * Render hourly rows as HTML string
 */
export function renderHourlyRowsString(relevantHours, { peerGroupId, isMainGroupOpen, isPeerGroupOpen, parentPeer }) {
  if (!Array.isArray(relevantHours) || relevantHours.length === 0) return '';
  const hourDataMap = new Map(relevantHours.map((h) => [h.time, h]));
  const times = relevantHours.map((h) => new Date(h.time).getTime());
  const minTime = new Date(Math.min(...times));
  const maxTime = new Date(Math.max(...times));
  const metricColumns = getColumnConfig().slice(3);
  const visible = isMainGroupOpen && isPeerGroupOpen;
  let html = '';
  const sorted = Array.from(new Set(times)).sort((a, b) => a - b);
  let minDiff = Infinity;
  for (let i = 1; i < sorted.length; i++) { const diff = sorted[i] - sorted[i - 1]; if (diff > 0 && diff < minDiff) minDiff = diff; }
  const isFive = minDiff < 30 * 60e3;
  const stepMs = isFive ? 5 * 60e3 : 60 * 60e3;
  const formatFull = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  for (let t = minTime.getTime(); t <= maxTime.getTime(); t += stepMs) {
    const d = new Date(t);
    const key = isFive ? formatFull(d) : formatDateToKey(d);
    const rowData = hourDataMap.get(key);
    // Use class-based visibility to avoid inline style conflicts with toggles
    const [datePart, timePart] = key.split(' ');
    const guideClass = getHierarchyVisuals('hour');
    const indentStyle = getHierarchyIndent('hour');
    const rowClasses = ['hour-row', guideClass];
    if (!visible) rowClasses.push('is-hidden');
    html += `<tr class="${rowClasses.join(' ')}" data-group="${peerGroupId}">`;
    html += `<td data-filter-value="${escapeHtml(datePart)}" style="${indentStyle}"><div class="datetime-cell-container"><span class="date-part">${escapeHtml(datePart)}</span><span class="time-part">${escapeHtml(timePart)}</span></div></td>`;
    html += `<td data-filter-value="${escapeHtml(parentPeer.peer)}">${escapeHtml(parentPeer.peer)}</td>`;
    html += `<td data-filter-value="${escapeHtml(parentPeer.destination)}">${escapeHtml(parentPeer.destination)}</td>`;
    if (rowData) {
      html += renderMetricCellsString(rowData);
    } else {
      metricColumns.forEach((col) => {
        const yAttr = col.isYColumn ? ' data-y-toggleable="true"' : '';
        html += `<td${yAttr}>-</td>`;
      });
    }
    html += `</tr>`;
  }
  return html;
}

// ---- helpers for string rendering ----
function renderMetricCellsString(rowData) {
  const metrics = ["Min", "ACD", "ASR", "SCall", "TCall"];
  let html = '';
  metrics.forEach((metricName) => {
    const value = rowData[metricName];
    const yesterdayValue = rowData[`Y${metricName}`];
    const delta = rowData[`${metricName}_delta`];
    let deltaPercent = null;
    if (
      typeof value === 'number' &&
      typeof yesterdayValue === 'number' &&
      yesterdayValue !== 0
    ) {
      deltaPercent = ((value - yesterdayValue) / Math.abs(yesterdayValue)) * 100;
    }
    // main metric cell
    const shouldDisable = (metricName === 'Min' || metricName === 'SCall' || metricName === 'TCall');
    const cls = shouldDisable ? '' : getAnomalyClass({ key: metricName, value, yesterdayValue, deltaPercent });
    const extraASR = (metricName === 'ASR') ? ` class="${[cls, 'asr-cell-hover'].filter(Boolean).join(' ').trim()}" data-pdd="${escapeHtml(rowData.PDD ?? 'N/A')}" data-atime="${escapeHtml(rowData.ATime ?? 'N/A')}"` : (cls ? ` class="${cls}"` : '');

    // Heatmap styling
    const heatmapStyle = getHeatmapStyle(metricName, value);
    const styleAttr = heatmapStyle ? ` style="${heatmapStyle}"` : '';

    // Micro-chart (Sparkbar) for visual context
    let microChart = '';
    if (typeof value === 'number' && (metricName === 'ASR' || metricName === 'ACD')) {
      const max = metricName === 'ASR' ? 100 : 30; // approximate max for ACD
      microChart = generateSparkbar(value, max, { width: 24, height: 4, color: 'rgba(0,0,0,0.2)', bgColor: 'rgba(0,0,0,0.05)' });
    }

    html += `<td${extraASR}${styleAttr}>${formatCellValue(metricName, value)}${microChart}</td>`;
    // yesterday cell (Y)
    html += `<td data-y-toggleable="true">${formatCellValue(metricName, yesterdayValue)}</td>`;
    // delta cell
    if (typeof delta === 'number' && delta !== 0) {
      const absDelta = Math.abs(delta);
      const cls = delta > 0 ? 'cell-positive' : 'cell-negative';
      html += `<td class="${cls}">${absDelta.toFixed(1)}</td>`;
    } else {
      html += `<td>-</td>`;
    }
  });
  return html;
}

function formatCellValue(metricName, val) {
  if (val === '' || val == null) return '-';
  const toOneDecimal = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (typeof val === 'number') {
    if (metricName === 'Min') return String(Math.round(val));
    if (metricName === 'ACD' || metricName === 'ASR') return toOneDecimal(val);
    return Number.isInteger(val) ? String(val) : String(val); // без навяз. округления
  }
  const n = parseFloat(val);
  if (!isNaN(n)) {
    if (metricName === 'Min') return String(Math.round(n));
    if (metricName === 'ACD' || metricName === 'ASR') return toOneDecimal(n);
    return Number.isInteger(n) ? String(n) : String(n);
  }
  return escapeHtml(String(val));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
