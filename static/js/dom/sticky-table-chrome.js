// static/js/dom/sticky-table-chrome.js
// Responsibility: Sticky clones for table header and footer
import { subscribe } from '../state/eventBus.js';
import { getState, toggleYColumnsVisible } from '../state/tableState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { setPendingFilterFocus } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SELECTORS = {
  container: 'virtual-scroll-container',
  table: 'summaryTable',
  resultsDisplay: '.results-display',
  realFooterInput: '#summaryTable tfoot input[data-filter-key="%key%"]',
  yToggleBtn: '.y-column-toggle-btn'
};

const CLASSES = {
  floatingHeader: 'floating-table-header',
  floatingFooter: 'floating-table-footer',
  hidden: 'is-hidden',
  yColumnsHidden: 'y-columns-hidden',
  focused: 'is-focused'
};

const INTERACTION_GRACE_MS = 300;
const RESYNC_DELAY_MS = 60;
const FOCUS_RESTORE_DELAY_MS = 10;

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const state = {
  // header
  floatingHeader: null,
  headerSyncBound: null,
  rafHeaderScheduled: false,
  headerShown: false,

  // footer
  floatingFooter: null,
  footerSyncBound: null,
  rafFooterScheduled: false,
  footerShown: false,
  footerEngaged: false,
  lastInteractionTs: 0,
  focusedInputKey: null
};

// ─────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────

function getContainer() {
  return document.getElementById(SELECTORS.container);
}

function getTable() {
  return document.getElementById(SELECTORS.table);
}

function getViewportHeight() {
  return window.innerHeight || document.documentElement.clientHeight;
}

function toggleHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle(CLASSES.hidden, hidden);
}

function mirrorYColumnsClass(source, target) {
  if (!source || !target) return;
  const hasHidden = source.classList.contains(CLASSES.yColumnsHidden);
  target.classList.toggle(CLASSES.yColumnsHidden, hasHidden);
}

function setCellWidth(cell, width) {
  cell.style.boxSizing = 'border-box';
  cell.style.width = `${width}px`;
  cell.style.minWidth = `${width}px`;
  cell.style.maxWidth = `${width}px`;
}

// ─────────────────────────────────────────────────────────────
// Zoom Helper
// ─────────────────────────────────────────────────────────────

function getZoomFactor() {
  const z = parseFloat(getComputedStyle(document.body).zoom);
  return (isNaN(z) || z === 0) ? 1 : z;
}

// ─────────────────────────────────────────────────────────────
// Focus visual sync
// ─────────────────────────────────────────────────────────────

function syncFocusVisual() {
  const footer = state.floatingFooter;
  if (!footer) return;

  const inputs = footer.querySelectorAll('input[data-filter-key]');
  const active = document.activeElement;
  const activeKey = active?.dataset?.filterKey;

  // update focusedInputKey based on current focus in floating or real footer
  if (active && activeKey) {
    const inFloating = footer.contains(active);
    const inReal = document.querySelector('#summaryTable tfoot')?.contains(active);
    if (inFloating || inReal) {
      state.focusedInputKey = activeKey;
    }
  }

  // sync visual class to all inputs
  inputs.forEach(inp => {
    const key = inp.dataset.filterKey;
    const shouldBeFocused = key === state.focusedInputKey;
    inp.classList.toggle(CLASSES.focused, shouldBeFocused);

    // restore actual focus if needed
    if (shouldBeFocused && document.activeElement !== inp && state.footerShown) {
      inp.focus();
    }
  });
}

function clearFocusVisual() {
  const footer = state.floatingFooter;
  if (!footer) return;

  footer.querySelectorAll('input[data-filter-key]').forEach(inp => {
    inp.classList.remove(CLASSES.focused);
  });
}

// ─────────────────────────────────────────────────────────────
// RAF-throttled sync
// ─────────────────────────────────────────────────────────────

function createRafSync(setupFn, syncFn, rafFlag) {
  return () => {
    if (state[rafFlag]) return;
    state[rafFlag] = true;
    requestAnimationFrame(() => {
      state[rafFlag] = false;
      setupFn();
      syncFn();
    });
  };
}

function attachSyncListeners(syncFn) {
  window.addEventListener('scroll', syncFn, { passive: true });
  window.addEventListener('resize', syncFn);

  const container = getContainer();
  if (container) {
    container.addEventListener('scroll', syncFn, { passive: true });
  }

  subscribe('tableState:changed', syncFn);
  subscribe('tableState:yVisibilityChanged', syncFn);
  subscribe('appState:reverseModeChanged', syncFn);
}

// ─────────────────────────────────────────────────────────────
// Sticky Header
// ─────────────────────────────────────────────────────────────

function bindHeaderYToggle() {
  const header = state.floatingHeader;
  if (!header || header._yBound) return;

  header.addEventListener('click', (e) => {
    const btn = e.target?.closest?.(SELECTORS.yToggleBtn);
    if (btn) {
      try { toggleYColumnsVisible(); } catch (err) {
        logError(ErrorCategory.DOM, 'stickyHeader:yToggle', err);
      }
    }
  });
  header._yBound = true;
}

function createFloatingHeader(table, thead) {
  const wrap = document.createElement('div');
  wrap.className = CLASSES.floatingHeader;
  wrap.classList.add(CLASSES.hidden);

  const tmpTable = document.createElement('table');
  tmpTable.className = table.className;
  mirrorYColumnsClass(table, tmpTable);
  tmpTable.appendChild(thead.cloneNode(true));
  wrap.appendChild(tmpTable);
  document.body.appendChild(wrap);

  return wrap;
}

function setupFloatingHeader() {
  const container = getContainer();
  const table = getTable();
  const thead = table?.querySelector('thead');
  if (!container || !table || !thead) return;

  if (!state.floatingHeader) {
    state.floatingHeader = createFloatingHeader(table, thead);
    bindHeaderYToggle();
  } else {
    const ftable = state.floatingHeader.querySelector('table');
    if (ftable) {
      ftable.className = table.className;
      mirrorYColumnsClass(table, ftable);
      const old = ftable.querySelector('thead');
      if (old) old.replaceWith(thead.cloneNode(true));
    }
    bindHeaderYToggle();
  }

  syncFloatingHeader();
}

function syncFloatingHeader() {
  const container = getContainer();
  const table = getTable();
  const thead = table?.querySelector('thead');
  const header = state.floatingHeader;
  if (!container || !table || !thead || !header) return;

  const zoom = getZoomFactor();
  const rect = container.getBoundingClientRect();
  const headerBox = thead.getBoundingClientRect();
  const viewportH = getViewportHeight();

  const tableVisible = rect.top < viewportH && rect.bottom > 0;
  const originalVisible = headerBox.top < viewportH && headerBox.bottom > 0;

  // hide if table not visible or original header visible
  if (!tableVisible || originalVisible) {
    if (state.headerShown) {
      toggleHidden(header, true);
      header.style.pointerEvents = 'none';
      state.headerShown = false;
    }
    return;
  }

  // show
  if (!state.headerShown) {
    toggleHidden(header, false);
    header.style.pointerEvents = 'auto';
    state.headerShown = true;
  }

  // position (unscale by zoom)
  const ftable = header.querySelector('table');

  // We use clientWidth/table offsetWidth because they are unzoomed layout values usually.
  // But for fixed positioning `element.style.width`, we might need adjustment if using rect.
  // Let's use rect for precise screen alignment, then unscale.
  const containerWidth = rect.width / zoom;
  const containerLeft = rect.left / zoom;

  // table internal width likely doesn't need scaling if we use offsetWidth (pixels inside container)
  const tableWidth = table.offsetWidth; // native layout width

  header.style.position = 'fixed';
  header.style.top = '0px';
  header.style.left = `${containerLeft}px`;
  header.style.zIndex = '10000';
  header.style.width = `${containerWidth}px`;

  if (ftable) {
    ftable.style.width = `${tableWidth}px`;
    ftable.style.transform = `translateX(${-container.scrollLeft}px)`;
  }

  syncCellWidths(table.querySelectorAll('thead th'), header.querySelectorAll('thead th'), zoom);
}

function syncCellWidths(srcCells, dstCells, zoom = 1) {
  const srcLen = srcCells.length;
  const dstLen = dstCells.length;
  const minLen = Math.min(srcLen, dstLen);

  for (let i = 0; i < minLen; i++) {
    const rect = srcCells[i].getBoundingClientRect();
    const width = rect.width / zoom;
    setCellWidth(dstCells[i], width);
  }

  for (let i = minLen; i < dstLen; i++) {
    setCellWidth(dstCells[i], 0);
  }
}

export function initStickyHeader() {
  setupFloatingHeader();
  state.headerSyncBound = createRafSync(setupFloatingHeader, syncFloatingHeader, 'rafHeaderScheduled');
  attachSyncListeners(state.headerSyncBound);
}

// ─────────────────────────────────────────────────────────────
// Sticky Footer
// ─────────────────────────────────────────────────────────────

function saveFocusState() {
  const footer = state.floatingFooter;
  const active = document.activeElement;

  if (!footer || !active || !footer.contains(active) || active.tagName !== 'INPUT') {
    return null;
  }

  try {
    return {
      key: active.getAttribute('data-filter-key'),
      value: active.value,
      selStart: active.selectionStart,
      selEnd: active.selectionEnd
    };
  } catch {
    return { key: active.getAttribute('data-filter-key'), value: active.value };
  }
}

function restoreFocusState(focusState) {
  if (!focusState?.key || !state.floatingFooter) return;

  const input = state.floatingFooter.querySelector(`tfoot input[data-filter-key="${focusState.key}"]`);
  if (!input) return;

  input.value = focusState.value || '';

  // delay focus to ensure DOM is ready
  setTimeout(() => {
    input.focus();
    if (focusState.selStart != null && input.setSelectionRange) {
      try {
        input.setSelectionRange(focusState.selStart, focusState.selEnd);
      } catch {
        // selection not supported
      }
    }
  }, FOCUS_RESTORE_DELAY_MS);
}

function createFloatingFooter(table, tfoot) {
  const wrap = document.createElement('div');
  wrap.className = CLASSES.floatingFooter;
  wrap.classList.add(CLASSES.hidden);

  const tmpTable = document.createElement('table');
  tmpTable.className = table.className;
  mirrorYColumnsClass(table, tmpTable);
  tmpTable.appendChild(tfoot.cloneNode(true));
  wrap.appendChild(tmpTable);
  document.body.appendChild(wrap);

  return wrap;
}

function isFooterInteracting() {
  const active = document.activeElement;
  const footer = state.floatingFooter;
  if (!footer || !active) return false;

  const inFloating = footer.contains(active);
  const inReal = document.querySelector('#summaryTable tfoot')?.contains(active);
  const inGrace = (Date.now() - state.lastInteractionTs) < INTERACTION_GRACE_MS;

  return inFloating || inReal || state.footerEngaged || inGrace;
}

function syncFooterInputValues(srcTfoot, dstTfoot) {
  if (!srcTfoot || !dstTfoot) return;

  const srcInputs = srcTfoot.querySelectorAll('input[data-filter-key]');
  const dstInputs = dstTfoot.querySelectorAll('input[data-filter-key]');

  const dstMap = new Map();
  dstInputs.forEach(inp => dstMap.set(inp.dataset.filterKey, inp));

  srcInputs.forEach(src => {
    const key = src.dataset.filterKey;
    const dst = dstMap.get(key);
    if (dst && dst !== document.activeElement && dst.value !== src.value) {
      dst.value = src.value;
    }
  });
}

function setupFloatingFooter() {
  const container = getContainer();
  const table = getTable();
  const tfoot = table?.querySelector('tfoot');
  if (!container || !table || !tfoot) return;

  // skip full rebuild if user is interacting
  if (state.floatingFooter && isFooterInteracting()) {
    const ftable = state.floatingFooter.querySelector('table');
    if (ftable) {
      ftable.className = table.className;
      mirrorYColumnsClass(table, ftable);
      // sync input values without replacing DOM
      syncFooterInputValues(tfoot, ftable.querySelector('tfoot'));
    }
    syncFloatingFooter();
    return;
  }

  const focusState = saveFocusState();

  if (!state.floatingFooter) {
    state.floatingFooter = createFloatingFooter(table, tfoot);
    bindFooterInputs();
  } else {
    const ftable = state.floatingFooter.querySelector('table');
    if (ftable) {
      ftable.className = table.className;
      mirrorYColumnsClass(table, ftable);
      const old = ftable.querySelector('tfoot');
      if (old) old.replaceWith(tfoot.cloneNode(true));
      bindFooterInputs();
    }
  }

  restoreFocusState(focusState);
  syncFloatingFooter();
}

function getInteractionContext() {
  const active = document.activeElement;
  const _footer = state.floatingFooter;

  const activeInFloating = !!(active && active.closest('.' + CLASSES.floatingFooter));
  const activeInReal = !!(active && active.closest('#summaryTable tfoot'));
  const isInteracting = activeInFloating || activeInReal || state.footerEngaged;

  let hasActiveFilters = false;
  try {
    const { columnFilters = {} } = getState();
    // use for-in loop instead of Object.values().some()
    for (const key in columnFilters) {
      const v = columnFilters[key];
      if (v && String(v).trim().length > 0) {
        hasActiveFilters = true;
        break;
      }
    }
  } catch (e) {
    logError(ErrorCategory.STATE, 'getInteractionContext', e);
  }

  const inGrace = (Date.now() - state.lastInteractionTs) < INTERACTION_GRACE_MS;

  return { isInteracting, hasActiveFilters, inGrace };
}

function transferFocusToRealFooter() {
  const active = document.activeElement;
  const footer = state.floatingFooter;

  if (!active || !footer?.contains(active)) return;

  const key = active.getAttribute('data-filter-key');
  if (!key) return;

  // keep focusedInputKey so visual focus restores when floating footer returns
  state.focusedInputKey = key;
  clearFocusVisual();

  const realInput = document.querySelector(SELECTORS.realFooterInput.replace('%key%', key));
  if (!realInput) return;

  try {
    const pos = typeof active.selectionStart === 'number' ? active.selectionStart : active.value?.length || 0;
    realInput.focus();
    if (realInput.setSelectionRange) realInput.setSelectionRange(pos, pos);
  } catch {
    // focus transfer failed
  }
}

function syncFloatingFooter() {
  const container = getContainer();
  const table = getTable();
  const tfoot = table?.querySelector('tfoot');
  const footer = state.floatingFooter;
  if (!container || !table || !tfoot || !footer) return;

  const zoom = getZoomFactor();
  const rect = container.getBoundingClientRect();
  const viewportH = getViewportHeight();
  const tfootBox = tfoot.getBoundingClientRect();

  const originalVisible = tfootBox.top < viewportH && tfootBox.bottom > 0;
  const tableVisible = rect.top < viewportH && rect.bottom > 0;
  const containerHasVScroll = container.scrollHeight > container.clientHeight + 1;
  const pageNeedsFooter = rect.bottom > viewportH;

  // always hide if original is visible
  if (originalVisible) {
    transferFocusToRealFooter();
    if (state.footerShown) {
      toggleHidden(footer, true);
      state.footerShown = false;
    }
    return;
  }

  // determine if should show
  const ctx = getInteractionContext();
  const shouldShow = ctx.isInteracting || ctx.hasActiveFilters || ctx.inGrace ||
    (!originalVisible && (containerHasVScroll || pageNeedsFooter) && tableVisible);

  if (!shouldShow) {
    if (state.footerShown) {
      toggleHidden(footer, true);
      state.footerShown = false;
    }
    return;
  }

  // show and position
  if (!state.footerShown) {
    toggleHidden(footer, false);
    state.footerShown = true;
  }

  const ftable = footer.querySelector('table');
  const tableWidth = table.offsetWidth; // use unscaled layout width

  const containerLeft = rect.left / zoom;
  const containerWidth = rect.width / zoom;

  // Apply unscaled position
  footer.style.left = `${containerLeft}px`;
  footer.style.width = `${containerWidth}px`;

  if (ftable) {
    ftable.style.width = `${tableWidth}px`;
    ftable.style.transform = `translateX(${-container.scrollLeft}px)`;
  }

  syncFooterCellWidths(table, footer.querySelector('tfoot'), zoom);

  // sync visual focus state
  syncFocusVisual();
}

function syncFooterCellWidths(table, dstTfoot, zoom = 1) {
  if (!dstTfoot) return;

  const cells = Array.from(table.querySelectorAll('tfoot tr:first-child td'));
  const dstCells = Array.from(dstTfoot.querySelectorAll('tr:first-child td'));

  const minLen = Math.min(cells.length, dstCells.length);

  for (let i = 0; i < minLen; i++) {
    const rect = cells[i].getBoundingClientRect();
    const width = rect.width / zoom;
    setCellWidth(dstCells[i], width);
  }
}

// ─────────────────────────────────────────────────────────────
// Footer input binding
// ─────────────────────────────────────────────────────────────

function bindFooterInputs() {
  const footer = state.floatingFooter;
  if (!footer) return;

  footer.querySelectorAll('tfoot input[data-filter-key]').forEach(inp => {
    if (inp._ff_bound) return;

    inp.addEventListener('mousedown', () => {
      try {
        const key = inp.getAttribute('data-filter-key');
        const pos = inp.selectionStart ?? inp.value?.length ?? 0;
        setPendingFilterFocus({ key, fromFloating: true, cursorPosition: pos });
        state.lastInteractionTs = Date.now();
        state.footerEngaged = true;
      } catch (e) {
        logError(ErrorCategory.DOM, 'bindFooterInputs:mousedown', e);
      }
    });

    inp.addEventListener('focusin', () => {
      state.footerEngaged = true;
      state.lastInteractionTs = Date.now();
      // clear old focus, set new
      clearFocusVisual();
      const key = inp.dataset.filterKey;
      state.focusedInputKey = key;
      inp.classList.add(CLASSES.focused);
    });

    inp.addEventListener('blur', () => {
      setTimeout(() => {
        const active = document.activeElement;
        const stillInside = footer.contains(active);
        const inRealFooter = document.querySelector('#summaryTable tfoot')?.contains(active);
        state.footerEngaged = stillInside;
        if (!stillInside && !inRealFooter) {
          state.lastInteractionTs = Date.now();
          // clear focus state when leaving both footers
          state.focusedInputKey = null;
          clearFocusVisual();
        }
      }, 0);
    });

    inp.addEventListener('input', () => {
      state.lastInteractionTs = Date.now();
      proxyFooterInput(inp);
    });

    inp.addEventListener('change', () => {
      state.lastInteractionTs = Date.now();
      proxyFooterInput(inp);
    });

    inp._ff_bound = true;
  });
}

function proxyFooterInput(floatingInput) {
  const key = floatingInput.dataset.filterKey;
  if (!key) return;

  const cursorPos = floatingInput.selectionStart;
  const cursorEnd = floatingInput.selectionEnd;

  const real = document.querySelector(SELECTORS.realFooterInput.replace('%key%', key));
  if (!real || real.value === floatingInput.value) return;

  real.value = floatingInput.value;
  const detail = { fromFloating: true, cursorPosition: cursorPos };
  real.dispatchEvent(new CustomEvent('input', { bubbles: true, detail }));
  real.dispatchEvent(new CustomEvent('change', { bubbles: true, detail }));

  // restore cursor
  requestAnimationFrame(() => {
    if (document.activeElement === floatingInput && floatingInput.setSelectionRange) {
      const maxPos = floatingInput.value.length;
      floatingInput.setSelectionRange(Math.min(cursorPos, maxPos), Math.min(cursorEnd, maxPos));
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Visibility hooks
// ─────────────────────────────────────────────────────────────

function attachVisibilityHooks() {
  const results = document.querySelector(SELECTORS.resultsDisplay);
  if (results) {
    const observer = new MutationObserver(() => {
      const isHidden = results.style.display === 'none' || results.classList.contains(CLASSES.hidden);
      if (isHidden && state.floatingFooter) {
        toggleHidden(state.floatingFooter, true);
      }
    });
    observer.observe(results, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  const hideAndResync = () => {
    if (state.floatingFooter) toggleHidden(state.floatingFooter, true);
    setTimeout(() => {
      try { state.footerSyncBound?.(); } catch { /* best-effort */ }
    }, RESYNC_DELAY_MS);
  };

  document.getElementById('btnReverse')?.addEventListener('click', hideAndResync);
  document.getElementById('findButton')?.addEventListener('click', hideAndResync);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initStickyFooter() {
  setupFloatingFooter();
  state.footerSyncBound = createRafSync(setupFloatingFooter, syncFloatingFooter, 'rafFooterScheduled');
  attachSyncListeners(state.footerSyncBound);
  attachVisibilityHooks();
}
