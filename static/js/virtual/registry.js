// static/js/virtual/registry.js
// Simple registry to avoid window globals for VirtualManager instance

let __currentManager = null;
export function setCurrentManager(vm) { __currentManager = vm || null; }
export function getCurrentManager() { return __currentManager; }
