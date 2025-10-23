// static/js/utils/domPatcher-example.js
// Example usage of the DOM Patcher with morphdom

import { domPatcher, patchDOM, setPatcherContainer, getPatcherStatus } from './domPatcher.js';
import { stateManager } from '../state/stateManager.js';

/**
 * Example: Basic DOM patcher usage
 */
function basicPatcherExample() {
  console.log('🚀 Starting basic DOM patcher example...');
  
  // Initialize the patcher
  domPatcher.initialize();
  
  // Set container
  const container = document.getElementById('dashboard-container');
  if (container) {
    setPatcherContainer(container);
    console.log('✅ Container set for patching');
  }
  
  // Get status
  const status = getPatcherStatus();
  console.log('📊 Patcher status:', status);
}

/**
 * Example: Patching DOM with state changes
 */
function patchDOMExample() {
  console.log('🔄 Patching DOM with state changes...');
  
  const newState = {
    app: {
      filters: {
        customer: 'Patched Corp',
        supplier: 'Patched Provider',
        destination: 'Patched Dest'
      }
    }
  };
  
  // Force a patch operation
  patchDOM(newState);
  console.log('✅ DOM patch requested');
}

/**
 * Example: Testing virtualization protection
 */
function testVirtualizationProtection() {
  console.log('🛡️ Testing virtualization protection...');
  
  // Try to patch table-related state
  const tableState = {
    table: {
      display: {
        compactMode: true
      }
    }
  };
  
  // This should NOT affect the virtualized table
  patchDOM(tableState);
  console.log('✅ Table state patch requested (should not affect virtualization)');
}

/**
 * Example: Debounced patching
 */
function debouncedPatchingExample() {
  console.log('⏱️ Testing debounced patching...');
  
  // Multiple rapid state changes
  for (let i = 0; i < 5; i++) {
    const state = {
      app: {
        filters: {
          customer: `Rapid Corp ${i}`,
          supplier: `Rapid Provider ${i}`
        }
      }
    };
    
    patchDOM(state);
    console.log(`🚀 Patch ${i + 1} queued`);
  }
  
  // Only the last one should execute due to debouncing
  console.log('✅ Multiple patches queued (only last one should execute)');
}

/**
 * Example: Monitoring patch operations
 */
function monitorPatchingExample() {
  console.log('📊 Monitoring patch operations...');
  
  // Set up monitoring
  const monitorInterval = setInterval(() => {
    const status = getPatcherStatus();
    console.log('📊 Current patcher status:', status);
    
    if (status.queueLength === 0 && !status.isPatching) {
      clearInterval(monitorInterval);
      console.log('✅ Patching completed');
    }
  }, 200);
  
  // Trigger some patches
  setTimeout(() => {
    patchDOM({ app: { filters: { customer: 'Monitored Corp' } } });
  }, 100);
}

/**
 * Example: Error handling and fallback
 */
function errorHandlingExample() {
  console.log('⚠️ Testing error handling...');
  
  // Try to patch with invalid state
  try {
    patchDOM(null);
  } catch (error) {
    console.log('✅ Error caught:', error.message);
  }
  
  // Try to patch without container
  domPatcher.setContainer(null);
  try {
    patchDOM({ app: { filters: { customer: 'Error Corp' } } });
  } catch (error) {
    console.log('✅ Container error caught:', error.message);
  }
}

/**
 * Example: Performance testing
 */
function performanceTestExample() {
  console.log('⚡ Performance testing...');
  
  const startTime = performance.now();
  
  // Multiple patches
  for (let i = 0; i < 10; i++) {
    const state = {
      app: {
        filters: {
          customer: `Perf Corp ${i}`,
          supplier: `Perf Provider ${i}`
        }
      }
    };
    
    patchDOM(state);
  }
  
  const endTime = performance.now();
  console.log(`⚡ Performance test completed in ${(endTime - startTime).toFixed(2)}ms`);
}

/**
 * Example: Integration with state manager
 */
function stateIntegrationExample() {
  console.log('🔗 Testing state integration...');
  
  // Listen to state changes
  stateManager.addStateChangeListener(() => {
    console.log('🔄 State changed, DOM patcher will handle it automatically');
  });
  
  // Trigger state change
  setTimeout(() => {
    stateManager.saveState();
  }, 1000);
  
  console.log('✅ State integration test set up');
}

// Export example functions
export {
  basicPatcherExample,
  patchDOMExample,
  testVirtualizationProtection,
  debouncedPatchingExample,
  monitorPatchingExample,
  errorHandlingExample,
  performanceTestExample,
  stateIntegrationExample
};

// Example usage in console:
// import { basicPatcherExample, patchDOMExample } from './utils/domPatcher-example.js';
// basicPatcherExample();
// patchDOMExample();
