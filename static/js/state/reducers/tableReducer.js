// static/js/state/reducers/tableReducer.js
// Responsibility: Pure reducer for table state

// ─────────────────────────────────────────────────────────────
// Action types
// ─────────────────────────────────────────────────────────────

const ACTIONS = {
  SORT_SET: 'table/sort/set',
  DISPLAY_SET: 'table/display/set',
  COLUMNS_SET: 'table/columns/set',
  BEHAVIOR_SET: 'table/behavior/set',
  PERFORMANCE_SET: 'table/performance/set',
  EXPORT_SET: 'table/export/set',
  GLOBAL_FILTER_SET: 'table/globalFilter/set',
  COLUMN_FILTER_SET: 'table/columnFilter/set',
  FILTERS_RESET: 'table/filters/reset'
};

const VALID_DIRECTIONS = ['asc', 'desc'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function updateTable(state, tableUpdate) {
  return {
    ...state,
    table: {
      ...state.table,
      ...tableUpdate
    }
  };
}

function mergeTableSection(state, section, payload) {
  return updateTable(state, {
    [section]: {
      ...(state.table?.[section] || {}),
      ...(payload || {})
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────

export function reducer(state, action) {
  if (!state || !action) return state;

  const { type, payload } = action;

  switch (type) {
    case ACTIONS.SORT_SET: {
      const { column, direction } = payload || {};
      if (typeof column !== 'string' || !VALID_DIRECTIONS.includes(direction)) {
        return state;
      }
      return updateTable(state, {
        multiSort: [{ key: column, dir: direction }]
      });
    }

    case ACTIONS.DISPLAY_SET:
      return mergeTableSection(state, 'display', payload);

    case ACTIONS.COLUMNS_SET:
      return mergeTableSection(state, 'columns', payload);

    case ACTIONS.BEHAVIOR_SET:
      return mergeTableSection(state, 'behavior', payload);

    case ACTIONS.PERFORMANCE_SET:
      return mergeTableSection(state, 'performance', payload);

    case ACTIONS.EXPORT_SET:
      return mergeTableSection(state, 'export', payload);

    case ACTIONS.GLOBAL_FILTER_SET:
      return updateTable(state, { globalFilterQuery: payload ?? '' });

    case ACTIONS.COLUMN_FILTER_SET: {
      const { key, value = '' } = payload || {};
      if (typeof key !== 'string') return state;

      const nextFilters = { ...(state.table?.columnFilters || {}) };
      if (value) {
        nextFilters[key] = value;
      } else {
        delete nextFilters[key];
      }
      return updateTable(state, { columnFilters: nextFilters });
    }

    case ACTIONS.FILTERS_RESET:
      return updateTable(state, {
        globalFilterQuery: '',
        columnFilters: {}
      });

    default:
      return state;
  }
}
