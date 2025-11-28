// static/js/state/store.js
// Унифицированный фасад-хранилище поверх существующего StateManager.
// Не дублирует архитектуру: использует stateManager как источник истины
// и его механизм слушателей для подписок.

import { stateManager } from './stateManager.js';
import { publish } from './eventBus.js';
import { reducer as filtersReducer } from './reducers/filtersReducer.js';
import { reducer as tableReducer } from './reducers/tableReducer.js';
import { setFilters } from './appState.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import {
  setDisplaySettings,
  setColumnSettings,
  setBehaviorSettings,
  setPerformanceSettings,
  setExportSettings,
  setGlobalFilter,
  setColumnFilter,
  resetColumnFilters,
  setMultiSort
} from './tableState.js';

// Единый источник правды. Храним текущее слепок полного состояния.
// Обновляется автоматически на каждом изменении состояния.
const state = {
  current: stateManager.getCompleteState()
};

// Флаг отладки для условного логирования
let debug = false;

export function setDebugLogging(enabled) {
  debug = !!enabled;
}

export function isDebugLoggingEnabled() {
  return debug;
}

/**
 * Возвращает текущее состояние (единый слепок app/table/url).
 * Не мутируйте возвращаемый объект снаружи.
 */
export function getState() {
  return state.current;
}

/**
 * Подписка на обновления состояния.
 * listener: (nextState) => void
 * Возвращает функцию отписки.
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('subscribe(listener) требует функцию');
  }

  // Оборачиваем слушатель, чтобы обновлять локальный слепок и прокидывать наружу
  const wrapped = (nextCompleteState) => {
    state.current = nextCompleteState;
    try {
      listener(nextCompleteState);
    } catch (err) {
      // Не ломаем цепочку уведомлений
      // eslint-disable-next-line no-console
      console.error('store.subscribe: ошибка в listener:', err);
    }
  };

  // Регистрируем в stateManager и получаем возможность отписки
  stateManager.addStateChangeListener(wrapped);

  // Немедленно уведомим подписчика актуальным состоянием (часто удобно для инициализации UI)
  try {
    listener(state.current);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('store.subscribe: ошибка при начальном вызове listener:', err);
  }

  // Возвращаем функцию отписки
  return () => stateManager.removeStateChangeListener(wrapped);
}

// Экспортируем объект state как "единый источник правды" (через поле current)
export { state };

/**
 * dispatch(action)
 * Action: { type: string, payload?: any }
 * - Публикует действие в eventBus: 'action' и 'action:<type>'
 * - Ждет микротик, затем обновляет локальный слепок и вызывает подписчиков
 */
export function dispatch(action) {
  if (!action || typeof action !== 'object') {
    throw new TypeError('dispatch(action) требует объект');
  }
  const { type, payload } = action;
  if (!type || typeof type !== 'string') {
    throw new TypeError('dispatch(action) требует поле type строкового типа');
  }

  // 1) Сообщаем всем заинтересованным модулям через Pub/Sub
  try {
    publish('action', { type, payload });
    publish(`action:${type}`, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('store.dispatch: ошибка при публикации action:', err);
  }

  // 2) Прогоняем действие через редьюсеры (чистые функции)
  const prev = stateManager.getCompleteState();
  const reducedOnce = filtersReducer(prev, action);
  const next = tableReducer(reducedOnce, action);

  // Логируем входящее действие и предполагаемое новое состояние (до применения setters)
  try {
    if ((typeof window !== 'undefined' && window.DEBUG === true) || debug) {
      // eslint-disable-next-line no-console
      console.log('[store.dispatch] action:', { type, payload });
      // eslint-disable-next-line no-console
      console.log('[store.dispatch] next (reduced):', next);
    }
  } catch (e) { logError(ErrorCategory.STATE, 'store', e);
    /* no-op: logging is optional */
  }

  // 3) Коммитим отличия через существующие setters, чтобы не ломать архитектуру
  try {
    // 3.1 Обновление фильтров приложения
    if (next.app && prev.app && !deepEqual(next.app.filters, prev.app.filters)) {
      setFilters(next.app.filters || {});
    }

    if (next.table && prev.table) {
      // 3.2 Отображение
      if (!deepEqual(next.table.display, prev.table.display)) {
        setDisplaySettings(next.table.display || {});
      }
      // 3.3 Колонки
      if (!deepEqual(next.table.columns, prev.table.columns)) {
        setColumnSettings(next.table.columns || {});
      }
      // 3.4 Поведение
      if (!deepEqual(next.table.behavior, prev.table.behavior)) {
        setBehaviorSettings(next.table.behavior || {});
      }
      // 3.5 Производительность
      if (!deepEqual(next.table.performance, prev.table.performance)) {
        setPerformanceSettings(next.table.performance || {});
      }
      // 3.6 Экспорт
      if (!deepEqual(next.table.export, prev.table.export)) {
        setExportSettings(next.table.export || {});
      }
      // 3.7 Глобальный фильтр
      if (next.table.globalFilterQuery !== prev.table.globalFilterQuery) {
        setGlobalFilter(next.table.globalFilterQuery || '');
      }
      // 3.8 Фильтры колонок
      if (!deepEqual(next.table.columnFilters, prev.table.columnFilters)) {
        // Пересобираем набор фильтров, чтобы не оставалось старых ключей
        resetColumnFilters();
        const cf = next.table.columnFilters || {};
        Object.keys(cf).forEach((k) => {
          if (cf[k]) setColumnFilter(k, cf[k]);
        });
      }
      // 3.9 Сортировка (multiSort)
      if (!deepEqual(next.table.multiSort, prev.table.multiSort) && Array.isArray(next.table.multiSort)) {
        setMultiSort(next.table.multiSort);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('store.dispatch: ошибка при применении изменений через setters:', err);
  }

  // 4) Обновляем локальный слепок после коммитов. Уведомления подпищикам
  // выполнит существующая система событий через setters/stateManager.
  queueMicrotask(() => {
    state.current = stateManager.getCompleteState();
    try {
      if ((typeof window !== 'undefined' && window.DEBUG === true) || debug) {
        // eslint-disable-next-line no-console
        console.log('[store.dispatch] state after commit:', state.current);
      }
    } catch (e) { logError(ErrorCategory.STATE, 'store', e);
      /* no-op: logging is optional */
    }
  });
}

// Вспомогательная функция поверхностного сравнения (через JSON)
function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) { logError(ErrorCategory.STATE, 'store', e);
    return a === b;
  }
}
