// static/js/dom/sticky-table-chrome.js
// Responsibility: Provide sticky clones for table chrome parts (footer for now)

import { subscribe } from "../state/eventBus.js";
import { getState, toggleYColumnsVisible } from "../state/tableState.js";

let floatingFooter;
let onSyncBound;
let _rafFooterScheduled = false;
let lastFloatingInteractionTs = 0; // Tracks recent user interaction in floating footer
const INTERACTION_GRACE_MS = 300; // Do not hide for a short time after interaction
let _floatingShown = false; // Visibility state to prevent flicker
let _floatingEngaged = false; // Sticky engagement while user works in floating footer

export function initStickyFooter() {
  setupFloatingFooter();
  // Sync on scroll/resize and on state changes (re-setup to keep clone fresh)
  onSyncBound = () => {
    if (_rafFooterScheduled) return;
    _rafFooterScheduled = true;
    requestAnimationFrame(() => {
      _rafFooterScheduled = false;
      setupFloatingFooter();
      syncFloatingFooter();
    });
  };
  window.addEventListener("scroll", onSyncBound, { passive: true });
  window.addEventListener("resize", onSyncBound);
  const container = document.getElementById("virtual-scroll-container");
  if (container) container.addEventListener("scroll", onSyncBound, { passive: true });

  subscribe("tableState:changed", onSyncBound);
  subscribe("tableState:yVisibilityChanged", onSyncBound);
  // Also re-sync on reverse mode toggle – layout/visibility can change
  subscribe("appState:reverseModeChanged", onSyncBound);

  // Hide floating footer immediately when table is hidden (e.g., Reverse/Find)
  attachVisibilityHooks();
}

// Bind Y-columns toggle inside the floating header so it mirrors the real header behavior
function bindHeaderYToggle() {
  if (!floatingHeader) return;
  if (floatingHeader._yBound) return;
  floatingHeader.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('.y-column-toggle-btn');
    if (!btn) return;
    try { toggleYColumnsVisible(); } catch(_) {
    // Ignore sticky chrome errors
  }
  });
  floatingHeader._yBound = true;
}

// === Sticky Header (floating thead) ===
let floatingHeader;
let onSyncHeaderBound;
let _rafHeaderScheduled = false;
let _floatingHeaderShown = false;

export function initStickyHeader() {
  setupFloatingHeader();
  onSyncHeaderBound = () => {
    if (_rafHeaderScheduled) return;
    _rafHeaderScheduled = true;
    requestAnimationFrame(() => {
      _rafHeaderScheduled = false;
      setupFloatingHeader();
      syncFloatingHeader();
    });
  };
  window.addEventListener("scroll", onSyncHeaderBound, { passive: true });
  window.addEventListener("resize", onSyncHeaderBound);
  const container = document.getElementById("virtual-scroll-container");
  if (container) container.addEventListener("scroll", onSyncHeaderBound, { passive: true });

  subscribe("tableState:changed", onSyncHeaderBound);
  subscribe("tableState:yVisibilityChanged", onSyncHeaderBound);
  subscribe("appState:reverseModeChanged", onSyncHeaderBound);
}

function setupFloatingHeader() {
  const container = document.getElementById("virtual-scroll-container");
  const table = document.getElementById("summaryTable");
  const thead = table ? table.querySelector("thead") : null;
  if (!container || !table || !thead) return;

  if (!floatingHeader) {
    const wrap = document.createElement("div");
    wrap.className = "floating-table-header";
    wrap.classList.add("is-hidden");

    const tmpTable = document.createElement("table");
    tmpTable.className = table.className;
    if (table.classList.contains('y-columns-hidden')) tmpTable.classList.add('y-columns-hidden');
    tmpTable.appendChild(thead.cloneNode(true));
    wrap.appendChild(tmpTable);
    document.body.appendChild(wrap);
    floatingHeader = wrap;
    bindHeaderYToggle();
  } else {
    const ftable = floatingHeader.querySelector("table");
    if (ftable) {
      ftable.className = table.className;
      if (table.classList.contains('y-columns-hidden')) ftable.classList.add('y-columns-hidden');
      else ftable.classList.remove('y-columns-hidden');
      const old = ftable.querySelector("thead");
      if (old) old.replaceWith(thead.cloneNode(true));
    }
    bindHeaderYToggle();
  }

  syncFloatingHeader();
}

function syncFloatingHeader() {
  const container = document.getElementById("virtual-scroll-container");
  const table = document.getElementById("summaryTable");
  const thead = table ? table.querySelector("thead") : null;
  if (!container || !table || !thead || !floatingHeader) return;

  const rect = container.getBoundingClientRect();
  const headerBox = thead.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;

  const tableVisibleInViewport = rect.top < viewportH && rect.bottom > 0;
  // Original header is considered visible if any part of it is within the viewport
  const originalHeaderVisible = (headerBox.top < viewportH) && (headerBox.bottom > 0);

  if (!tableVisibleInViewport || originalHeaderVisible) {
    if (_floatingHeaderShown) {
      floatingHeader.classList.add('is-hidden');
      try { floatingHeader.style.pointerEvents = 'none'; } catch(_) {
    // Ignore sticky chrome errors
  }
      _floatingHeaderShown = false;
    }
    return;
  }

  if (!_floatingHeaderShown) {
    floatingHeader.classList.remove('is-hidden');
    try { floatingHeader.style.pointerEvents = 'auto'; } catch(_) {
    // Ignore sticky chrome errors
  }
    _floatingHeaderShown = true;
  }

  const ftable = floatingHeader.querySelector('table');
  const tableWidth = Math.round(table.getBoundingClientRect().width);
  floatingHeader.style.position = 'fixed';
  floatingHeader.style.top = '0px';
  floatingHeader.style.left = `${rect.left}px`;
  floatingHeader.style.zIndex = '10000';
  floatingHeader.style.width = `${container.clientWidth}px`;
  if (ftable) {
    ftable.style.width = `${tableWidth}px`;
    ftable.style.transform = `translateX(${-container.scrollLeft}px)`;
  }

  syncHeaderCellWidths(table, floatingHeader.querySelector('thead'));
}

function syncHeaderCellWidths(table, dstThead) {
  if (!dstThead) return;
  const srcThs = Array.from(table.querySelectorAll('thead th'));
  const dstThs = Array.from(dstThead.querySelectorAll('th'));
  const widths = srcThs.map((th) => Math.round(th.getBoundingClientRect().width));
  dstThs.forEach((th, i) => {
    const w = widths[i] || 0;
    th.style.boxSizing = 'border-box';
    th.style.width = `${w}px`;
    th.style.minWidth = `${w}px`;
    th.style.maxWidth = `${w}px`;
  });
}

function setupFloatingFooter() {
  const container = document.getElementById("virtual-scroll-container");
  const table = document.getElementById("summaryTable");
  const tfoot = table ? table.querySelector("tfoot") : null;
  if (!container || !table || !tfoot) return;

  // Preserve focus if user is typing in floating footer input
  let restoreFocus = false;
  let focusKey = null;
  let focusValue = "";
  let selStart = null;
  let selEnd = null;
  const active = document.activeElement;
  if (floatingFooter && active && floatingFooter.contains(active) && active.tagName === 'INPUT') {
    restoreFocus = true;
    focusKey = active.getAttribute('data-filter-key');
    focusValue = active.value;
    try {
      selStart = active.selectionStart;
      selEnd = active.selectionEnd;
    } catch (_) { /* intentional no-op: selection range not available */ }
  }

  if (!floatingFooter) {
    const wrap = document.createElement("div");
    wrap.className = "floating-table-footer";
    // use CSS class for static positioning; start hidden
    wrap.classList.add('is-hidden');

    const tmpTable = document.createElement("table");
    tmpTable.className = table.className;
    // Mirror Y-columns hidden state
    if (table.classList.contains('y-columns-hidden')) {
      tmpTable.classList.add('y-columns-hidden');
    } else {
      tmpTable.classList.remove('y-columns-hidden');
    }
    tmpTable.appendChild(tfoot.cloneNode(true));
    wrap.appendChild(tmpTable);
    document.body.appendChild(wrap);
    floatingFooter = wrap;
    bindFooterInputs();
  } else {
    const ftable = floatingFooter.querySelector("table");
    if (ftable) {
      ftable.className = table.className;
      // Mirror Y-columns hidden state on update
      if (table.classList.contains('y-columns-hidden')) {
        ftable.classList.add('y-columns-hidden');
      } else {
        ftable.classList.remove('y-columns-hidden');
      }
      const old = ftable.querySelector("tfoot");
      if (old) old.replaceWith(tfoot.cloneNode(true));
      bindFooterInputs();
    }
  }

  // Restore focus and caret position if needed
  if (restoreFocus && focusKey) {
    const newInput = floatingFooter.querySelector(`tfoot input[data-filter-key="${focusKey}"]`);
    if (newInput) {
      newInput.value = focusValue;
      newInput.focus();
      if (selStart != null && selEnd != null && newInput.setSelectionRange) {
        try { newInput.setSelectionRange(selStart, selEnd); } catch (_) { /* intentional no-op: selection restore best-effort */ }
      }
    }
  }

  syncFloatingFooter();
}

function syncFloatingFooter() {
  const container = document.getElementById("virtual-scroll-container");
  const table = document.getElementById("summaryTable");
  const tfoot = table ? table.querySelector("tfoot") : null;
  if (!container || !table || !tfoot || !floatingFooter) return;

  // Visibility context
  let isInteracting = false;
  let hasActiveFilters = false;
  try {
    const active = document.activeElement;
    const activeInFloating = !!(active && active.closest('.floating-table-footer'));
    const activeInReal = !!(active && active.closest('#summaryTable tfoot'));
    isInteracting = activeInFloating || activeInReal || _floatingEngaged;
    const { columnFilters = {} } = getState();
    hasActiveFilters = Object.values(columnFilters).some(v => (v || '').toString().trim().length > 0);
  } catch (_) { /* ignore */ }
  const now = Date.now();
  const inGrace = (now - lastFloatingInteractionTs) < INTERACTION_GRACE_MS;

  const rect = container.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  // Determine scroll mode and visibility conditions
  const containerHasVScroll = container.scrollHeight > container.clientHeight + 1;
  // Visibility of original footer relative to WINDOW viewport (more reliable: tfoot may sit outside the scroll container)
  const originalFooterBox = tfoot.getBoundingClientRect();
  const originalFooterVisibleInViewport = originalFooterBox.top < viewportH && originalFooterBox.bottom > 0;
  const tableVisibleInViewport = rect.top < viewportH && rect.bottom > 0;
  const pageNeedsFooter = rect.bottom > viewportH; // container extends beyond viewport

  // Hard mutual exclusion: if original footer is visible in WINDOW viewport, ALWAYS hide floating footer
  if (originalFooterVisibleInViewport) {
    const activeEl = document.activeElement;
    if (activeEl && floatingFooter.contains(activeEl)) {
      const key = activeEl.getAttribute('data-filter-key');
      if (key) {
        const realInput = document.querySelector(`#summaryTable tfoot input[data-filter-key="${key}"]`);
        if (realInput) {
          // Transfer focus and caret to real footer input
          try {
            const pos = typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : (activeEl.value || '').length;
            realInput.focus();
            if (typeof realInput.setSelectionRange === 'function') realInput.setSelectionRange(pos, pos);
          } catch(_) { /* noop */ }
        }
      }
    }
    if (_floatingShown) {
      floatingFooter.classList.add('is-hidden');
      _floatingShown = false;
    }
    return;
  }

  // Show rules unified:
  // - Show if interacting OR filters active OR within grace window
  // - Else show when original footer is NOT visible in WINDOW and (container has vertical scroll OR page needs footer)
  let shouldShow = false;
  if (isInteracting || hasActiveFilters || inGrace) {
    shouldShow = true;
  } else {
    shouldShow = (!originalFooterVisibleInViewport && (containerHasVScroll || pageNeedsFooter) && tableVisibleInViewport);
  }
  if (!shouldShow) {
    if (_floatingShown) {
      floatingFooter.classList.add('is-hidden');
      _floatingShown = false;
    }
    return;
  }

  if (!_floatingShown) {
    floatingFooter.classList.remove('is-hidden');
    _floatingShown = true;
  }
  floatingFooter.style.left = `${rect.left}px`;
  floatingFooter.style.width = `${container.clientWidth}px`;

  const ftable = floatingFooter.querySelector("table");
  // Match exact width including borders
  const tableWidth = Math.round(table.getBoundingClientRect().width);
  ftable.style.width = `${tableWidth}px`;
  floatingFooter.style.width = `${container.clientWidth}px`;
  ftable.style.transform = `translateX(${-container.scrollLeft}px)`;

  const dstTfoot = floatingFooter.querySelector("tfoot");
  syncFooterCellWidths(table, dstTfoot);
  try { if (window.restoreFilterFocusIfPending) window.restoreFilterFocusIfPending(); } catch (_) { /* intentional no-op */ }
}

function attachVisibilityHooks() {
  const results = document.querySelector('.results-display');
  if (results) {
    const observer = new MutationObserver(() => {
      const isHidden = results.style.display === 'none' || results.classList.contains('is-hidden');
      if (isHidden && floatingFooter) {
        floatingFooter.classList.add('is-hidden');
      }
    });
    observer.observe(results, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  const hideNow = () => {
    if (floatingFooter) floatingFooter.classList.add('is-hidden');
    // Schedule a re-sync soon after reverse/find actions complete
    setTimeout(() => {
      try { onSyncBound(); } catch (_) { /* intentional no-op: resync best-effort */ }
    }, 60);
  };
  const reverseBtn = document.getElementById('btnReverse');
  if (reverseBtn) reverseBtn.addEventListener('click', hideNow);
  const findBtn = document.getElementById('findButton');
  if (findBtn) findBtn.addEventListener('click', hideNow);
}

function syncFooterCellWidths(table, dstTfoot) {
  // Build list of visible header widths (exclude Y when hidden)
  const tableHasHiddenY = table.classList.contains('y-columns-hidden');
  const headerThs = Array.from(table.querySelectorAll('thead th'));
  const visibleHeaderWidths = [];
  headerThs.forEach((th) => {
    const isY = th.dataset && th.dataset.yToggleable === 'true';
    if (!tableHasHiddenY || !isY) {
      visibleHeaderWidths.push(Math.round(th.getBoundingClientRect().width));
    }
  });

  // Apply widths to each footer row independently, mapping only visible cells
  const rows = Array.from(dstTfoot.querySelectorAll('tr'));
  rows.forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll('td'));
    // Special case: info row with single colspan cell
    if (cells.length === 1 && (parseInt(cells[0].getAttribute('colspan') || '1', 10) > 1)) {
      // Set total width to container width via table width
      const total = Math.round(table.getBoundingClientRect().width);
      const td = cells[0];
      td.style.boxSizing = 'border-box';
      td.style.width = `${total}px`;
      td.style.minWidth = `${total}px`;
      td.style.maxWidth = `${total}px`;
      return;
    }

    // Map visible widths to visible cells (skip Y when hidden)
    const visibleCells = cells.filter((td) => td.getAttribute('data-y-toggleable') !== 'true' || !tableHasHiddenY);
    if (visibleCells.length !== visibleHeaderWidths.length) {
      // Fallback: set each cell to equal share to avoid drift
      const share = Math.floor(table.getBoundingClientRect().width / Math.max(1, visibleCells.length));
      visibleCells.forEach((td) => {
        td.style.boxSizing = 'border-box';
        td.style.width = `${share}px`;
        td.style.minWidth = `${share}px`;
        td.style.maxWidth = `${share}px`;
      });
      return;
    }
    visibleCells.forEach((td, i) => {
      const w = visibleHeaderWidths[i];
      td.style.boxSizing = 'border-box';
      td.style.width = `${w}px`;
      td.style.minWidth = `${w}px`;
      td.style.maxWidth = `${w}px`;
    });
  });
}

function bindFooterInputs() {
  if (!floatingFooter) return;
  const inputs = floatingFooter.querySelectorAll('tfoot input[data-filter-key]');
  inputs.forEach((inp) => {
    if (inp._ff_bound) return;
    // Hint pending focus on mouse down to avoid race on first click
    inp.addEventListener('mousedown', () => {
      try {
        const key = inp.getAttribute('data-filter-key');
        const pos = typeof inp.selectionStart === 'number' ? inp.selectionStart : (inp.value || '').length;
        window._pendingFilterFocus = { key, fromFloating: true, cursorPosition: pos };
        lastFloatingInteractionTs = Date.now();
        _floatingEngaged = true;
      } catch(_) { /* noop */ }
    });
    inp.addEventListener('focusin', () => { _floatingEngaged = true; lastFloatingInteractionTs = Date.now(); });
    inp.addEventListener('blur', () => {
      // Delay to see where focus moved
      setTimeout(() => {
        const active = document.activeElement;
        const stillInside = !!(active && floatingFooter && floatingFooter.contains(active));
        const inRealFooter = !!(active && document.querySelector('#summaryTable tfoot')?.contains(active));
        _floatingEngaged = stillInside; // if moved to real footer, disengage
        if (!stillInside && !inRealFooter) lastFloatingInteractionTs = Date.now();
      }, 0);
    });
    inp.addEventListener('input', () => { lastFloatingInteractionTs = Date.now(); proxyFooterInput(inp); });
    inp.addEventListener('change', () => { lastFloatingInteractionTs = Date.now(); proxyFooterInput(inp); });
    inp._ff_bound = true;
  });
}

function proxyFooterInput(floatingInput) {
  const key = floatingInput.dataset.filterKey;
  if (!key) return;
  const real = document.querySelector(`#summaryTable tfoot input[data-filter-key="${key}"]`);
  if (!real) return;
  if (real.value !== floatingInput.value) {
    real.value = floatingInput.value;
    // Dispatch input/change as CustomEvents with a marker so handlers can restore focus to floating input
    const detail = { fromFloating: true };
    real.dispatchEvent(new CustomEvent('input', { bubbles: true, detail }));
    real.dispatchEvent(new CustomEvent('change', { bubbles: true, detail }));
  }
}


