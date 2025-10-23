// static/js/table/features/sortControl.js
// Ответственность: безопасно применять сортировку в стандартном и виртуальном режимах,
// сохраняя состояние раскрытия групп и избегая двойных рендеров.

import { getState, setMultiSort } from "../../state/tableState.js";
import { renderCoordinator } from "../../rendering/render-coordinator.js";

function computeNextMultiSort(current, key, textFields) {
  let ms = Array.isArray(current) ? [...current] : [];
  const found = ms.find((s) => s.key === key);
  if (!found) {
    // Первый клик по любому полю: всегда ASC (A→Z / 0→9)
    ms.unshift({ key, dir: 'asc' });
  } else if (ms[0] && ms[0].key === key) {
    found.dir = (found.dir === 'asc') ? 'desc' : 'asc';
  } else {
    // Поле уже было в списке, но не первичное: первый клик как по первичному -> ASC
    const rest = ms.filter((s) => s.key !== key);
    const promoted = { key: found.key, dir: 'asc' };
    ms = [promoted, ...rest];
  }
  return ms.slice(0, 3);
}

function isVirtual() {
  return !!(window.virtualManager && window.virtualManager.isActive);
}

export async function applySortSafe(key) {
  const { multiSort, textFields } = getState();
  const next = computeNextMultiSort(multiSort, key, textFields || []);
  // Для обоих режимов запускаем через координатор 'table':
  // 1) сначала применяем setMultiSort(next),
  // 2) затем один раз выполняем соответствующий рендер.
  // Так __renderingInProgress уже активен на момент публикации tableState:changed.
  await renderCoordinator.requestRender('table', async () => {
    try {
      setMultiSort(next);
      if (isVirtual()) {
        // Виртуальный режим: один гарантированный refresh внутри координатора
        try { const tb = document.getElementById('tableBody'); if (tb) tb.innerHTML = ''; } catch(_) {}
        window.virtualManager.refreshVirtualTable();
      } else {
        // Стандартный режим: рендерим напрямую (без вложенного координатора контроллера)
        // Если виртуальный менеджер активен — корректно завершить его, чтобы не было дублей слоёв
        try {
          if (window.virtualManager && window.virtualManager.isActive) {
            window.virtualManager.destroy();
          }
        } catch(_) {}
        try { const tb = document.getElementById('tableBody'); if (tb) tb.innerHTML = ''; } catch(_) {}
        const mod = await import('../../dom/table.js');
        const app = await import('../../data/tableProcessor.js');
        const { getMetricsData } = await import('../../state/appState.js');
        const data = getMetricsData();
        const { pagedData } = app.getProcessedData();
        mod.renderGroupedTable(pagedData || [], data?.peer_rows || [], data?.hourly_rows || []);
      }
    } catch (_) {}
  }, { debounceMs: 120, cooldownMs: 0 }); // user-driven sort must not be throttled by cooldown
  return true;
}
