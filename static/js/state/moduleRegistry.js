// static/js/state/moduleRegistry.js
// Responsibility: Centralized module instance registry

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const registry = {
  virtualManager: null,
  dashboard: null,
  tableRenderer: null
};

// ─────────────────────────────────────────────────────────────
// Generic accessors
// ─────────────────────────────────────────────────────────────

const get = key => registry[key];
const set = (key, instance) => { registry[key] = instance; };
const has = key => registry[key] != null;

// ─────────────────────────────────────────────────────────────
// Virtual Manager
// ─────────────────────────────────────────────────────────────

export const getVirtualManager = () => get('virtualManager');
export const setVirtualManager = instance => set('virtualManager', instance);
export const hasVirtualManager = () => has('virtualManager');

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

export const getDashboard = () => get('dashboard');
export const setDashboard = instance => set('dashboard', instance);

// ─────────────────────────────────────────────────────────────
// Table Renderer
// ─────────────────────────────────────────────────────────────

export const getTableRenderer = () => get('tableRenderer');
export const setTableRenderer = instance => set('tableRenderer', instance);
export const hasTableRenderer = () => has('tableRenderer');
