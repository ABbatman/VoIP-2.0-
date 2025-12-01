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
  let ms = Array.isArray(current) ? [...current] : [];
  const found = ms.find(s => s.key === key);

  if (!found) {
    // new key — add at front
    ms.unshift({ key, dir: 'asc' });
  } else if (ms[0]?.key === key) {
    // toggle direction if already primary
    found.dir = found.dir === 'asc' ? 'desc' : 'asc';
  } else {
    // promote to primary with asc
    ms = [{ key, dir: 'asc' }, ...ms.filter(s => s.key !== key)];
  }

  return ms.slice(0, MAX_SORT_KEYS);
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
