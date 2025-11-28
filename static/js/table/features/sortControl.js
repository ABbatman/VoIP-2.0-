// static/js/table/features/sortControl.js
// Ответственность: безопасно применять сортировку в стандартном и виртуальном режимах,
// сохраняя состояние раскрытия групп и избегая двойных рендеров.

import { getState, setMultiSort } from "../../state/tableState.js";
import { renderCoordinator } from "../../rendering/render-coordinator.js";
import { getVirtualManager } from "../../state/moduleRegistry.js";

function computeNextMultiSort(current, key, _textFields) {
  let ms = Array.isArray(current) ? [...current] : [];
  const found = ms.find((s) => s.key === key);
  if (!found) {
    ms.unshift({ key, dir: 'asc' });
  } else if (ms[0] && ms[0].key === key) {
    found.dir = (found.dir === 'asc') ? 'desc' : 'asc';
  } else {
    const rest = ms.filter((s) => s.key !== key);
    const promoted = { key: found.key, dir: 'asc' };
    ms = [promoted, ...rest];
  }
  return ms.slice(0, 3);
}

function isVirtual() {
  const vm = getVirtualManager();
  return !!(vm && vm.isActive);
}

export async function applySortSafe(key) {
  const { multiSort, textFields } = getState();
  const next = computeNextMultiSort(multiSort, key, textFields || []);
  
  const scrollContainer = document.getElementById('virtual-scroll-container') || 
                          document.querySelector('.results-display__table-wrapper');
  const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  
  await renderCoordinator.requestRender('table', async () => {
    try {
      setMultiSort(next);
      const vm = getVirtualManager();
      if (vm && vm.isActive) {
        vm.refreshVirtualTable();
        requestAnimationFrame(() => {
          if (scrollContainer) scrollContainer.scrollTop = savedScrollTop;
        });
      } else {
        // Standard mode
        const tb = document.getElementById('tableBody');
        if (tb) tb.innerHTML = '';
        const mod = await import('../../dom/table.js');
        const app = await import('../../data/tableProcessor.js');
        const { getMetricsData } = await import('../../state/appState.js');
        const data = getMetricsData();
        const { pagedData } = app.getProcessedData();
        mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
      }
    } catch (_) {
      // Ignore render errors
    }
  }, { debounceMs: 120, cooldownMs: 0 }); // user-driven sort must not be throttled by cooldown
  return true;
}
