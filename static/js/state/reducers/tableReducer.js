// static/js/state/reducers/tableReducer.js
// Чистый редьюсер таблицы. Меняет только table-секцию состояния.

export function reducer(state, action) {
  if (!state || !action) return state;
  const { type, payload } = action;

  switch (type) {
    case 'table/sort/set': {
      // Обновляем multiSort минимально: устанавливаем единственное правило сортировки
      const column = payload?.column;
      const direction = payload?.direction;
      if (typeof column !== 'string' || !['asc', 'desc'].includes(direction)) {
        return state ? { ...state } : state;
      }
      const nextMultiSort = [ { key: column, dir: direction } ];
      return {
        ...state,
        table: {
          ...state.table,
          multiSort: nextMultiSort,
        }
      };
    }
    case 'table/display/set': {
      return {
        ...state,
        table: {
          ...state.table,
          display: {
            ...(state.table?.display || {}),
            ...(payload || {})
          }
        }
      };
    }

    case 'table/columns/set': {
      return {
        ...state,
        table: {
          ...state.table,
          columns: {
            ...(state.table?.columns || {}),
            ...(payload || {})
          }
        }
      };
    }

    case 'table/behavior/set': {
      return {
        ...state,
        table: {
          ...state.table,
          behavior: {
            ...(state.table?.behavior || {}),
            ...(payload || {})
          }
        }
      };
    }

    case 'table/performance/set': {
      return {
        ...state,
        table: {
          ...state.table,
          performance: {
            ...(state.table?.performance || {}),
            ...(payload || {})
          }
        }
      };
    }

    case 'table/export/set': {
      return {
        ...state,
        table: {
          ...state.table,
          export: {
            ...(state.table?.export || {}),
            ...(payload || {})
          }
        }
      };
    }

    case 'table/globalFilter/set': {
      return {
        ...state,
        table: {
          ...state.table,
          globalFilterQuery: payload ?? ''
        }
      };
    }

    case 'table/columnFilter/set': {
      const key = payload?.key;
      const value = payload?.value ?? '';
      if (typeof key !== 'string') return state;
      const nextColumnFilters = { ...(state.table?.columnFilters || {}) };
      if (value) {
        nextColumnFilters[key] = value;
      } else {
        delete nextColumnFilters[key];
      }
      return {
        ...state,
        table: {
          ...state.table,
          columnFilters: nextColumnFilters
        }
      };
    }

    case 'table/filters/reset': {
      return {
        ...state,
        table: {
          ...state.table,
          globalFilterQuery: '',
          columnFilters: {}
        }
      };
    }

    default:
      // Возвращаем новый объект даже при отсутствии изменений
      return state ? { ...state } : state;
  }
}
