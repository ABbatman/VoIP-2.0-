// static/js/virtual/manager/render.js
// Responsibility: Render layer (adapter integration, refresh, DOM callbacks)
import { bindToggleHandlers, bindDblClickHandlers } from './events.js';
import { initTooltips } from '../../dom/tooltip.js';
import { connectFilterEventHandlers } from '../../dom/table-ui.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const CONTAINER_ID = 'virtual-scroll-container';

function safeCall(fn, ctx) {
  try { fn?.(); } catch (e) { logError(ErrorCategory.RENDER, ctx, e); }
}

function getVisibleData(vm) {
  return vm.selectors?.getLazyVisibleData?.() ?? vm.getLazyVisibleData();
}

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachRender(vm) {
  function initialRender(mainRows, peerRows, hourlyRows) {
    if (!vm.isActive || !vm.adapter) return false;

    try {
      const sortedMainRows = vm.applySortingToMainRows(mainRows);
      vm.rawData = { mainRows: sortedMainRows, peerRows, hourlyRows };
      vm.initializeLazyData();

      if (!vm.adapter.setData(getVisibleData(vm))) return false;

      if (!vm.headersInitialized) {
        safeCall(() => vm.renderTableHeaders?.(), 'vmRender:headers');
        vm.headersInitialized = true;
      } else {
        safeCall(() => vm.updateSortArrowsAfterRefresh?.(), 'vmRender:sortArrows');
      }

      safeCall(() => vm.processQueuedExpandCollapseAll?.(), 'vmRender:queuedExpand');
      return true;
    } catch (e) {
      logError(ErrorCategory.RENDER, 'vmRender:initial', e);
      return false;
    }
  }

  function refreshVirtualTable() {
    if (!vm.lazyData || !vm.adapter) return;

    try {
      const container = document.getElementById(CONTAINER_ID);
      const savedScroll = {
        x: container?.scrollLeft ?? 0,
        y: container?.scrollTop ?? 0,
        winX: window.scrollX,
        winY: window.scrollY
      };

      if (container) container.style.overflowAnchor = 'none';

      if (vm.adapter.setData(getVisibleData(vm))) {
        safeCall(() => vm.syncExpandCollapseAllButtonLabel?.(), 'vmRender:syncBtn');
      }

      // restore scroll
      const restore = () => {
        if (container) {
          container.scrollTop = savedScroll.y;
          container.scrollLeft = savedScroll.x;
          container.style.overflowAnchor = '';
        }
        if (window.scrollY !== savedScroll.winY || window.scrollX !== savedScroll.winX) {
          window.scrollTo(savedScroll.winX, savedScroll.winY);
        }
      };
      restore();
      requestAnimationFrame(restore);
    } catch (e) {
      logError(ErrorCategory.RENDER, 'vmRender:refresh', e);
    }
  }

  function forceImmediateRender() {
    safeCall(() => vm.adapter?.forceRender?.(), 'vmRender:force');
  }

  function setupDomCallbacks() {
    if (typeof vm.adapter?.setDOMUpdateCallback !== 'function') return;

    vm.adapter.setDOMUpdateCallback(() => {
      safeCall(() => bindToggleHandlers(vm), 'vmRender:toggleHandlers');
      safeCall(() => bindDblClickHandlers(vm), 'vmRender:dblClickHandlers');
      safeCall(() => vm.updateAllToggleButtons?.(), 'vmRender:updateToggles');
      safeCall(() => vm.syncFloatingHeader?.(), 'vmRender:syncHeader');
      safeCall(() => window.restoreFilterFocusIfPending?.(), 'vmRender:restoreFocus');
      safeCall(() => initTooltips(), 'vmRender:tooltips');
      safeCall(() => connectFilterEventHandlers(), 'vmRender:filterHandlers');
    });
  }

  function teardown() {}

  return { initialRender, refreshVirtualTable, forceImmediateRender, setupDomCallbacks, teardown };
}
