// static/js/dom/ellipsis-tooltip.js
// Responsibility: Tooltip for truncated (ellipsis) table cells

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TOOLTIP_ID = 'ellipsis-tooltip';
const VIRTUAL_CONTAINER_ID = 'virtual-scroll-container';
const TABLE_BODY_ID = 'tableBody';

const IGNORED_SELECTORS = '.asr-cell-hover, .y-column-toggle-btn, .sort-arrow, .toggle-btn, input';
const FLOATING_HEADER_SELECTOR = '.floating-table-header';
const FLOATING_FOOTER_SELECTOR = '.floating-table-footer';

const OFFSET_X = 12;
const OFFSET_Y = 14;
const TRUNCATION_TOLERANCE = 2;

const BOUND_FLAG = '_ellipsisBound';

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let tooltipEl = null;

// ─────────────────────────────────────────────────────────────
// Tooltip element
// ─────────────────────────────────────────────────────────────

function ensureTooltipElement() {
  tooltipEl = document.getElementById(TOOLTIP_ID);
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.className = 'ellipsis-tooltip is-hidden';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

// ─────────────────────────────────────────────────────────────
// Event binding
// ─────────────────────────────────────────────────────────────

function bindTooltipEvents(el) {
  if (!el || el[BOUND_FLAG]) return;

  el.addEventListener('mouseover', handleMouseOver, { passive: true });
  el.addEventListener('mouseout', handleMouseOut, { passive: true });
  el.addEventListener('mousemove', handleMouseMove, { passive: true });
  el[BOUND_FLAG] = true;
}

function bindById(id) {
  const el = document.getElementById(id);
  if (el) bindTooltipEvents(el);
  return el;
}

function bindBySelector(selector) {
  const el = document.querySelector(selector);
  if (el) bindTooltipEvents(el);
}

// ─────────────────────────────────────────────────────────────
// Mutation observers
// ─────────────────────────────────────────────────────────────

function observeAndBind(bindFn) {
  const observer = new MutationObserver(bindFn);
  observer.observe(document.body, { childList: true, subtree: true });
}

// ─────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────

function handleMouseOver(e) {
  if (e.target.closest(IGNORED_SELECTORS)) return;

  const td = e.target.closest('td');
  if (!td) return;

  const fullText = td.getAttribute('data-full-text') || td.getAttribute('data-filter-value') || '';
  if (!fullText) return;

  const isTruncated = td.scrollWidth > td.clientWidth + TRUNCATION_TOLERANCE;
  if (!isTruncated) return;

  tooltipEl.textContent = fullText;
  tooltipEl.classList.remove('is-hidden');
}

function handleMouseOut() {
  tooltipEl.classList.add('is-hidden');
}

function handleMouseMove(e) {
  if (tooltipEl.classList.contains('is-hidden')) return;
  tooltipEl.style.left = `${e.clientX + OFFSET_X}px`;
  tooltipEl.style.top = `${e.clientY + OFFSET_Y}px`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initEllipsisTooltip() {
  ensureTooltipElement();

  // bind to virtual container or table body
  const vc = bindById(VIRTUAL_CONTAINER_ID);
  if (!vc) bindById(TABLE_BODY_ID);

  // bind to floating elements
  bindBySelector(FLOATING_HEADER_SELECTOR);
  bindBySelector(FLOATING_FOOTER_SELECTOR);

  // observe for dynamically added elements
  observeAndBind(() => {
    bindById(VIRTUAL_CONTAINER_ID);
    bindBySelector(FLOATING_HEADER_SELECTOR);
    bindBySelector(FLOATING_FOOTER_SELECTOR);
  });
}
