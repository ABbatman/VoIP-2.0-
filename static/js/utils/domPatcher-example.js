// static/js/utils/domPatcher-example.js
// Responsibility: Example/demo usage of DOM Patcher (console logs intentional)
import { domPatcher, forcePatch, setPatcherContainer, getPatcherStatus } from './domPatcher.js';
import { stateManager } from '../state/stateManager.js';

// ─────────────────────────────────────────────────────────────
// Example: Basic usage
// ─────────────────────────────────────────────────────────────

export function basicPatcherExample() {
  console.log('🚀 Starting basic DOM patcher example...');

  domPatcher.initialize();

  const container = document.getElementById('dashboard-container');
  if (container) {
    setPatcherContainer(container);
    console.log('✅ Container set for patching');
  }

  console.log('📊 Patcher status:', getPatcherStatus());
}

// ─────────────────────────────────────────────────────────────
// Example: Patch with state
// ─────────────────────────────────────────────────────────────

export function patchDOMExample() {
  console.log('🔄 Patching DOM with state changes...');

  forcePatch({
    app: {
      filters: { customer: 'Patched Corp', supplier: 'Patched Provider', destination: 'Patched Dest' }
    }
  });

  console.log('✅ DOM patch requested');
}

// ─────────────────────────────────────────────────────────────
// Example: Virtualization protection
// ─────────────────────────────────────────────────────────────

export function testVirtualizationProtection() {
  console.log('🛡️ Testing virtualization protection...');

  forcePatch({ table: { display: { compactMode: true } } });

  console.log('✅ Table state patch requested (should not affect virtualization)');
}

// ─────────────────────────────────────────────────────────────
// Example: Debounced patching
// ─────────────────────────────────────────────────────────────

export function debouncedPatchingExample() {
  console.log('⏱️ Testing debounced patching...');

  for (let i = 0; i < 5; i++) {
    forcePatch({ app: { filters: { customer: `Rapid Corp ${i}`, supplier: `Rapid Provider ${i}` } } });
    console.log(`🚀 Patch ${i + 1} queued`);
  }

  console.log('✅ Multiple patches queued (only last one should execute)');
}

// ─────────────────────────────────────────────────────────────
// Example: Monitor patching
// ─────────────────────────────────────────────────────────────

export function monitorPatchingExample() {
  console.log('📊 Monitoring patch operations...');

  const monitorInterval = setInterval(() => {
    const status = getPatcherStatus();
    console.log('📊 Current patcher status:', status);

    if (status.queueLength === 0 && !status.isPatching) {
      clearInterval(monitorInterval);
      console.log('✅ Patching completed');
    }
  }, 200);

  setTimeout(() => forcePatch({ app: { filters: { customer: 'Monitored Corp' } } }), 100);
}

// ─────────────────────────────────────────────────────────────
// Example: Error handling
// ─────────────────────────────────────────────────────────────

export function errorHandlingExample() {
  console.log('⚠️ Testing error handling...');

  try {
    forcePatch(null);
  } catch (error) {
    console.log('✅ Error caught:', error.message);
  }

  domPatcher.setContainer(null);
  try {
    forcePatch({ app: { filters: { customer: 'Error Corp' } } });
  } catch (error) {
    console.log('✅ Container error caught:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Example: Performance test
// ─────────────────────────────────────────────────────────────

export function performanceTestExample() {
  console.log('⚡ Performance testing...');

  const start = performance.now();

  for (let i = 0; i < 10; i++) {
    forcePatch({ app: { filters: { customer: `Perf Corp ${i}`, supplier: `Perf Provider ${i}` } } });
  }

  console.log(`⚡ Performance test completed in ${(performance.now() - start).toFixed(2)}ms`);
}

// ─────────────────────────────────────────────────────────────
// Example: State integration
// ─────────────────────────────────────────────────────────────

export function stateIntegrationExample() {
  console.log('🔗 Testing state integration...');

  stateManager.addStateChangeListener(() => {
    console.log('🔄 State changed, DOM patcher will handle it automatically');
  });

  setTimeout(() => stateManager.saveState(), 1000);

  console.log('✅ State integration test set up');
}

// Usage: import { basicPatcherExample } from './domPatcher-example.js'; basicPatcherExample();
