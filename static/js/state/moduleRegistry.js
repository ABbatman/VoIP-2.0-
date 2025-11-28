// static/js/state/moduleRegistry.js
// Centralized registry for module instances to avoid window pollution
// Provides getters/setters with backward-compatible window.* bridge

const _registry = {
  virtualManager: null,
  dashboard: null,
};

// --- Virtual Manager ---
export function getVirtualManager() {
  return _registry.virtualManager;
}

export function setVirtualManager(instance) {
  _registry.virtualManager = instance;
}

export function hasVirtualManager() {
  return _registry.virtualManager !== null && _registry.virtualManager !== undefined;
}

// --- Dashboard ---
export function getDashboard() {
  return _registry.dashboard;
}

export function setDashboard(instance) {
  _registry.dashboard = instance;
}
