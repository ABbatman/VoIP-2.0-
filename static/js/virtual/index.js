// static/js/virtual/index.js
// Responsibility: Virtualization entry point and exports

import { VirtualManager } from './virtual-manager.js';
export { VirtualScroller } from './virtual-scroller.js';
export { VirtualTableAdapter } from './virtual-adapter.js';
export { VirtualManager } from './virtual-manager.js';
export { VirtualConfig, getVirtualConfig } from './config/virtual-config.js';
export { setCurrentManager, getCurrentManager } from './registry.js';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function initVirtualization() {
  const manager = new VirtualManager();
  const ok = await manager.initialize();
  return { ok, manager };
}
