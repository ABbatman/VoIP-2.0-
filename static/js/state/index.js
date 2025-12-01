// static/js/state/index.js
// Responsibility: Central re-export for state modules

// ─────────────────────────────────────────────────────────────
// Core state
// ─────────────────────────────────────────────────────────────

export * from './appState.js';
export * from './tableState.js';
export * from './eventBus.js';
export * from './urlState.js';

// ─────────────────────────────────────────────────────────────
// State manager
// ─────────────────────────────────────────────────────────────

export { stateManager, StateManager } from './stateManager.js';
export {
  getCompleteState,
  saveState,
  loadState,
  clearState,
  resetAllState,
  exportState,
  importState
} from './stateManager.js';

// ─────────────────────────────────────────────────────────────
// Store and reducers
// ─────────────────────────────────────────────────────────────

export * from './store.js';
export * from './reducers/filtersReducer.js';
export * from './reducers/tableReducer.js';
