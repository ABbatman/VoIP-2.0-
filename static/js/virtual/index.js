// Virtualization Entry Point
// Single Responsibility: Provide a stable entry for all virtualization modules and a simple init helper.

import { VirtualManager } from './virtual-manager.js';
export { VirtualScroller } from './virtual-scroller.js';
export { VirtualTableAdapter } from './virtual-adapter.js';
export { VirtualManager } from './virtual-manager.js';
export { VirtualConfig, getVirtualConfig } from './config/virtual-config.js';

// Simple registry to avoid window globals
let __currentManager = null;
export function setCurrentManager(vm) { __currentManager = vm || null; }
export function getCurrentManager() { return __currentManager; }

/**
 * Initialize virtualization stack in one call.
 * Returns a controller with the created VirtualManager instance and helpers.
 *
 * Usage example:
 *   import { initVirtualization } from './virtual/index.js';
 *   const { manager } = await initVirtualization();
 *   // later: manager.renderVirtualTable(mainRows, peerRows, hourlyRows)
 */
export async function initVirtualization() {
  const manager = new VirtualManager();
  const ok = await manager.initialize();
  return { ok, manager };
}
