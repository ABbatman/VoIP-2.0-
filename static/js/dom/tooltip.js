// static/js/dom/tooltip.js
// Responsibility: PDD/ATime tooltip on ASR cells

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TOOLTIP_ID = 'pdd-atime-tooltip';
const TABLE_BODY_ID = 'tableBody';
const ASR_CELL_SELECTOR = 'td.asr-cell-hover';
const HIDDEN_CLASS = 'is-hidden';
const CURSOR_OFFSET = 15;

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let tooltipEl = null;

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

function handleMouseOver(e) {
  const cell = e.target.closest(ASR_CELL_SELECTOR);
  if (!cell) return;

  const pdd = cell.dataset.pdd ?? 'N/A';
  const atime = cell.dataset.atime ?? 'N/A';

  tooltipEl.textContent = `PDD: ${pdd}\nATime: ${atime}`;
  tooltipEl.classList.remove(HIDDEN_CLASS);
}

function handleMouseOut() {
  tooltipEl.classList.add(HIDDEN_CLASS);
}

function handleMouseMove(e) {
  if (!tooltipEl || tooltipEl.classList.contains(HIDDEN_CLASS)) return;

  tooltipEl.style.left = `${e.clientX + CURSOR_OFFSET}px`;
  tooltipEl.style.top = `${e.clientY + CURSOR_OFFSET}px`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initTooltips() {
  tooltipEl = document.getElementById(TOOLTIP_ID);
  const tableBody = document.getElementById(TABLE_BODY_ID);

  if (!tooltipEl || !tableBody) return;

  tableBody.addEventListener('mouseover', handleMouseOver);
  tableBody.addEventListener('mouseout', handleMouseOut);
  tableBody.addEventListener('mousemove', handleMouseMove);
}
