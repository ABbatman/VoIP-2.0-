// static/js/virtual/scroller/diff.js
// Responsibility: Partial diff between existing TR and new row HTML
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DATA_ATTRS = ['data-pdd', 'data-atime', 'data-y-toggleable'];
const DATA_ATTRS_LEN = DATA_ATTRS.length;
const FILTER_ATTRS = ['data-filter-value', 'data-full-text'];
const FILTER_ATTRS_LEN = FILTER_ATTRS.length;
// Use Set for O(1) class lookup
const FILTER_CELL_CLASSES = new Set(['main-cell', 'peer-cell', 'destination-cell', 'hour-datetime']);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function syncAttr(src, dst, attr) {
  const val = src.getAttribute(attr);
  if (val !== null) {
    if (dst.getAttribute(attr) !== val) dst.setAttribute(attr, val);
  } else if (dst.hasAttribute(attr)) {
    dst.removeAttribute(attr);
  }
}

function isFilterCell(el) {
  const classList = el.classList;
  if (!classList) return false;
  // O(1) Set lookup for each class
  for (let i = 0; i < classList.length; i++) {
    if (FILTER_CELL_CLASSES.has(classList[i])) return true;
  }
  return false;
}

function syncCell(src, dst) {
  // class
  if (dst.className !== src.className) dst.className = src.className;

  // data-* attributes — indexed loop
  for (let i = 0; i < DATA_ATTRS_LEN; i++) {
    syncAttr(src, dst, DATA_ATTRS[i]);
  }

  // filter cell extra attributes — indexed loop
  if (isFilterCell(dst)) {
    for (let i = 0; i < FILTER_ATTRS_LEN; i++) {
      syncAttr(src, dst, FILTER_ATTRS[i]);
    }
  }

  // content
  const srcHasChildren = src.children?.length > 0;
  const dstHasChildren = dst.children?.length > 0;

  if (!srcHasChildren && !dstHasChildren) {
    if (dst.textContent !== src.textContent) dst.textContent = src.textContent;
  } else {
    if (dst.innerHTML !== src.innerHTML) dst.innerHTML = src.innerHTML;
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function applyRowDiff(tr, html, scratchTbody) {
  if (tr._htmlCache === html) return scratchTbody;

  scratchTbody ??= document.createElement('tbody');
  scratchTbody.innerHTML = `<tr>${html}</tr>`;

  const srcTr = scratchTbody.firstElementChild;
  const srcCells = srcTr?.children || [];
  const dstCells = tr.children;

  // fallback to full replace if cell count mismatch
  if (!srcTr || dstCells.length !== srcCells.length) {
    if (window.DEBUG) {
      logError(ErrorCategory.RENDER, 'scrollerDiff', `cell count mismatch: ${srcCells.length} vs ${dstCells.length}`);
    }
    tr.innerHTML = html;
  } else {
    for (let i = 0; i < srcCells.length; i++) {
      syncCell(srcCells[i], dstCells[i]);
    }
  }

  tr._htmlCache = html;
  return scratchTbody;
}
