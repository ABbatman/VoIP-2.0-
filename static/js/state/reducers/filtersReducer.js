// static/js/state/reducers/filtersReducer.js
// Чистый редьюсер: на вход слепок полного состояния, на выход — новый слепок
// Меняет только app.filters

const DEFAULT_FILTERS = {
  customer: "",
  supplier: "",
  destination: "",
  customerGroup: "",
  supplierGroup: "",
  destinationGroup: "",
  from: "",
  to: "",
};

export function reducer(state, action) {
  if (!state || !action) return state;
  const { type, payload } = action;

  switch (type) {
    case 'filters/set': {
      const nextFilters = { ...(state.app?.filters || {}), ...(payload || {}) };
      return {
        ...state,
        app: {
          ...state.app,
          filters: nextFilters,
        }
      };
    }

    case 'filter/set': {
      if (!payload || typeof payload.key !== 'string') return state;
      const nextFilters = { ...(state.app?.filters || {}) };
      nextFilters[payload.key] = payload.value ?? '';
      return {
        ...state,
        app: {
          ...state.app,
          filters: nextFilters,
        }
      };
    }

    case 'filters/reset': {
      return {
        ...state,
        app: {
          ...state.app,
          filters: { ...DEFAULT_FILTERS },
        }
      };
    }

    default:
      // Возвращаем новый объект даже при отсутствии изменений
      return state ? { ...state } : state;
  }
}
