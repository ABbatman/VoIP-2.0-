// static/js/state/reducers/filtersReducer.js
// Responsibility: Pure reducer for app.filters state

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  customer: '',
  supplier: '',
  destination: '',
  customerGroup: '',
  supplierGroup: '',
  destinationGroup: '',
  from: '',
  to: ''
};

// ─────────────────────────────────────────────────────────────
// Action types
// ─────────────────────────────────────────────────────────────

const ACTIONS = {
  SET_ALL: 'filters/set',
  SET_ONE: 'filter/set',
  RESET: 'filters/reset'
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function updateAppFilters(state, filters) {
  return {
    ...state,
    app: {
      ...state.app,
      filters
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────

export function reducer(state, action) {
  if (!state || !action) return state;

  const { type, payload } = action;

  switch (type) {
    case ACTIONS.SET_ALL:
      return updateAppFilters(state, {
        ...(state.app?.filters || {}),
        ...(payload || {})
      });

    case ACTIONS.SET_ONE: {
      if (!payload || typeof payload.key !== 'string') return state;
      return updateAppFilters(state, {
        ...(state.app?.filters || {}),
        [payload.key]: payload.value ?? ''
      });
    }

    case ACTIONS.RESET:
      return updateAppFilters(state, { ...DEFAULT_FILTERS });

    default:
      return state;
  }
}
