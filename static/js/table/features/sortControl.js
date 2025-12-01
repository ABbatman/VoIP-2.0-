// static/js/table/features/sortControl.js
// Responsibility: Apply sorting in standard and virtual modes
import { getState, setMultiSort } from '../../state/tableState.js';
import { renderCoordinator } from '../../rendering/render-coordinator.js';
import { getVirtualManager } from '../../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAX_SORT_KEYS = 3;
const SORT_DEBOUNCE_MS = 120;
const SCROLL_CONTAINER_ID = 'virtual-scroll-container';
const SCROLL_CONTAINER_SELECTOR = '.results-display__table-wrapper';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function computeNextMultiSort(current, key) {
  const ms = Array.isArray(current) ? current : [];
  const len = ms.length;

  // find index of key
  let foundIdx = -1;
  for (let i = 0; i < len; i++) {
    if (ms[i].key === key) {
      foundIdx = i;
      break;
    }
  }

  if (foundIdx === -1) {
    // new key — add at front, limit to MAX_SORT_KEYS
    const result = [{ key, dir: 'asc' }];
    const copyLen = Math.min(len, MAX_SORT_KEYS - 1);
    for (let i = 0; i < copyLen; i++) {
      result.push(ms[i]);
    }
    return result;
  }

  if (foundIdx === 0) {
    // toggle direction if already primary
    const result = [];
    for (let i = 0; i < len && i < MAX_SORT_KEYS; i++) {
      if (i === 0) {
        result.push({ key: ms[i].key, dir: ms[i].dir === 'asc' ? 'desc' : 'asc' });
      } else {
        result.push(ms[i]);
      }
    }
    return result;
  }

  // promote to primary with asc
  const result = [{ key, dir: 'asc' }];
  for (let i = 0; i < len && result.length < MAX_SORT_KEYS; i++) {
    if (ms[i].key !== key) {
      result.push(ms[i]);
    }
  }
  return result;
}

function getScrollContainer() {
  return document.getElementById(SCROLL_CONTAINER_ID) ||
         document.querySelector(SCROLL_CONTAINER_SELECTOR);
}

async function renderStandardTable() {
  const tb = document.getElementById('tableBody');
  if (tb) tb.innerHTML = '';

  const mod = await import('../../dom/table.js');
  const app = await import('../../data/tableProcessor.js');
  const { getMetricsData } = await import('../../state/appState.js');

  const data = getMetricsData();
  const { pagedData } = app.getProcessedData();
  mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function applySortSafe(key) {
  const { multiSort } = getState();
  const next = computeNextMultiSort(multiSort, key);

  const scrollContainer = getScrollContainer();
  const savedScrollTop = scrollContainer?.scrollTop ?? 0;

  await renderCoordinator.requestRender('table', async () => {
    try {
      setMultiSort(next);

      const vm = getVirtualManager();
      if (vm?.isActive) {
        vm.refreshVirtualTable();
        requestAnimationFrame(() => {
          if (scrollContainer) scrollContainer.scrollTop = savedScrollTop;
        });
      } else {
        await renderStandardTable();
      }
    } catch (e) {
      logError(ErrorCategory.TABLE, 'sortControl:applySortSafe', e);
    }
  }, { debounceMs: SORT_DEBOUNCE_MS, cooldownMs: 0 });

  return true;
}
