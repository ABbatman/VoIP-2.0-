// static/js/state/actions.js
// Чистые action creators. Не меняют состояние напрямую, лишь создают объекты действий.
// Типы согласованы с существующими редьюсерами и store.dispatch().

// ---- Типы действий (экспортируем для переиспользования) ----
export const FILTERS_SET = 'filters/set';
export const FILTER_SET = 'filter/set';
export const FILTERS_RESET = 'filters/reset';

export const TABLE_DISPLAY_SET = 'table/display/set';
export const TABLE_COLUMNS_SET = 'table/columns/set';
export const TABLE_BEHAVIOR_SET = 'table/behavior/set';
export const TABLE_PERFORMANCE_SET = 'table/performance/set';
export const TABLE_EXPORT_SET = 'table/export/set';
export const TABLE_GLOBAL_FILTER_SET = 'table/globalFilter/set';
export const TABLE_COLUMN_FILTER_SET = 'table/columnFilter/set';
export const TABLE_FILTERS_RESET = 'table/filters/reset';
export const TABLE_SORT_SET = 'table/sort/set'; // зарезервировано под обновление multiSort

// ---- Filters (app) ----
export const createSetFilters = (filters) => ({ type: FILTERS_SET, payload: filters });
export const createSetFilter = (key, value) => ({ type: FILTER_SET, payload: { key, value } });
export const createResetFilters = () => ({ type: FILTERS_RESET });

// ---- Table ----
export const createSetDisplay = (display) => ({ type: TABLE_DISPLAY_SET, payload: display });
export const createSetColumns = (columns) => ({ type: TABLE_COLUMNS_SET, payload: columns });
export const createSetBehavior = (behavior) => ({ type: TABLE_BEHAVIOR_SET, payload: behavior });
export const createSetPerformance = (performance) => ({ type: TABLE_PERFORMANCE_SET, payload: performance });
export const createSetExport = (exp) => ({ type: TABLE_EXPORT_SET, payload: exp });
export const createSetGlobalFilter = (query) => ({ type: TABLE_GLOBAL_FILTER_SET, payload: query });
export const createSetColumnFilter = (key, value) => ({ type: TABLE_COLUMN_FILTER_SET, payload: { key, value } });
export const createResetTableFilters = () => ({ type: TABLE_FILTERS_RESET });

// ---- Sort (multi-sort) ----
// column: string, direction: 'asc' | 'desc'
export const createSetSort = (column, direction) => ({ type: TABLE_SORT_SET, payload: { column, direction } });
