// static/js/virtual/scroller/status.js
// Responsibility: expose VirtualScroller status in a single place

export function getStatus(vm) {
  return {
    initialized: !!vm.isInitialized,
    dataCount: Array.isArray(vm.data) ? vm.data.length : 0,
    rowHeight: vm.rowHeight,
    bufferSize: vm.bufferSize,
    bufferMultiplier: vm._bufferMultiplier || 1,
    lastWindow: {
      start: vm.lastStartIndex,
      end: vm.lastEndIndex,
    },
  };
}
