// static/js/virtual/scroller/config-adapter.js
// Responsibility: adapt scroller runtime config based on data size
import { getOptimizedConfig } from '../../config/virtual-config.js';

export function applyOptimizedConfig(vm, dataLength) {
  const optimized = getOptimizedConfig(dataLength || 0);
  vm.bufferSize = optimized.BUFFER_SIZE;
  vm.scrollThrottle = optimized.SCROLL_THROTTLE_MS;
}
