// static/js/virtual/scroller/status.js
// Responsibility: VirtualScroller status exposure

export function getStatus(vm) {
  return {
    initialized: !!vm.isInitialized,
    dataCount: vm.data?.length ?? 0,
    rowHeight: vm.rowHeight,
    bufferSize: vm.bufferSize,
    bufferMultiplier: vm._bufferMultiplier ?? 1,
    lastWindow: { start: vm.lastStartIndex, end: vm.lastEndIndex }
  };
}
