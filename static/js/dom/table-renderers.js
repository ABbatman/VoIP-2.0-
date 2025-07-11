// static/js/dom/table-renderers.js
// This module contains functions responsible for creating the HTML elements for the table.

// --- MODIFIED: Corrected the import path ---
import { getAnomalyClass } from "../utils/helpers.js";
import { getColumnConfig } from "./table-ui.js";

// --- Row Creation Functions (no changes below) ---
export function createMainRow(mainRow, groupId) {
  const tr = document.createElement("tr");
  tr.classList.add("main-row");
  const mainCell = document.createElement("td");
  const toggleBtn = document.createElement("button");
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
      deltaPercent =
        ((value - yesterdayValue) / Math.abs(yesterdayValue)) * 100;
    }
    const tdMain = createCell(value);
    tdMain.className = getAnomalyClass({
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
    const tdYesterday = createCell(yesterdayValue);
    tdYesterday.dataset.yToggleable = "true";
    tr.appendChild(tdYesterday);
    const tdDelta = document.createElement("td");
    if (typeof delta === "number" && delta !== 0) {
      const absDelta = Math.abs(delta);
      const contentWrapper = document.createElement("span");
      contentWrapper.className = "delta-cell-content";
      const textNode = document.createTextNode(absDelta.toFixed(1));
      const arrowSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      arrowSvg.setAttribute("class", "delta-arrow");
      arrowSvg.setAttribute("viewBox", "0 0 10 10");
      arrowSvg.setAttribute("fill", "currentColor");
      arrowSvg.innerHTML = '<polygon points="0,0 10,5 0,10" />';
      contentWrapper.appendChild(textNode);
      contentWrapper.appendChild(arrowSvg);
      tdDelta.appendChild(contentWrapper);
      if (delta > 0) {
        tdDelta.classList.add("arrow-up");
      } else {
        tdDelta.classList.add("arrow-down");
      }
    } else {
      tdDelta.textContent = "-";
    }
    tr.appendChild(tdDelta);
  });
}

function createCell(content) {
  const td = document.createElement("td");
  td.textContent = content !== null && content !== undefined ? content : "-";
  return td;
}

function formatDateToKey(d) {
  const pad = (num) => num.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:00`;
}
