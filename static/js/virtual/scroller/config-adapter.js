// static/js/virtual/scroller/config-adapter.js
// Responsibility: Adapt scroller config based on data size
import { getOptimizedConfig } from '../../config/virtual-config.js';

export function applyOptimizedConfig(vm, dataLength) {
  const { BUFFER_SIZE, SCROLL_THROTTLE_MS } = getOptimizedConfig(dataLength || 0);
  vm.bufferSize = BUFFER_SIZE;
  vm.scrollThrottle = SCROLL_THROTTLE_MS;
}
