// static/js/state/index.js
// Central export file for all state management modules

// Core state modules
export * from './appState.js';
export * from './tableState.js';
export * from './eventBus.js';
export * from './urlState.js';

// State manager
export { stateManager, StateManager } from './stateManager.js';

// Store (centralized facade)
export * from './store.js';

// Reducers (pure state transforms used by store)
export * from './reducers/filtersReducer.js';
export * from './reducers/tableReducer.js';

// Convenience functions
export {
  getCompleteState,
  saveState,
  loadState,
  clearState,
  resetAllState,
  exportState,
  importState
} from './stateManager.js';

// Example usage

