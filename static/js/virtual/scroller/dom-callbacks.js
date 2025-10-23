// static/js/virtual/scroller/dom-callbacks.js
// Responsibility: throttle and dispatch DOM update callbacks for VirtualScroller

export function maybeNotifyDomUpdate(vm, { forceRender = false, structuralChange = false } = {}) {
  if (!vm || typeof vm.onDOMUpdate !== 'function') return;
  vm._domTick = (vm._domTick || 0) + 1;
  vm._lastStructuralChange = !!structuralChange;
  const should = forceRender || structuralChange || ((vm._domTick % (vm._domEvery || 3)) === 0);
  if (should) {
    try {
      const t1 = performance.now();
      vm.onDOMUpdate();
      const t2 = performance.now();
      const dur = t2 - t1;
      if (typeof window !== 'undefined' && window.DEBUG && dur > 16) {
        // eslint-disable-next-line no-console
        console.warn(`⚠️ onDOMUpdate budget exceeded: ${Math.round(dur)}ms (>16ms)`);
      }
    } catch (_) {}
  }
}
