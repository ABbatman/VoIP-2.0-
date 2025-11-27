// static/js/charts/services/layout.js
// layout utils for charts

// Unified grid layout for 4 charts - each gets exactly 25% of usable height
export function computeChartGrids(heightPx) {
  const topPad = 8;
  const bottomPad = 8;
  const gap = 8;
  const totalHeight = Math.max(200, heightPx || 520);
  // usable = total - top padding - bottom padding - 3 gaps between 4 charts
  const usable = totalHeight - topPad - bottomPad - gap * 3;
  // each chart gets exactly 25% of usable space
  const h = Math.floor(usable / 4);
  const grids = Array.from({ length: 4 }, (_, i) => ({
    left: 40,
    right: 16,
    top: topPad + i * (h + gap),
    height: h,
  }));
  return grids;
}

export function ensureFixedChartHeight(host, mount) {
  // use actual mount height on large screens
  const fallback = 520;
  const mountEl = mount || document.getElementById('chart-area-1');
  const mountH = mountEl ? (mountEl.clientHeight || mountEl.getBoundingClientRect().height || 0) : 0;
  
  // large screen: use actual container height
  if (mountH > 600) {
    try {
      if (mountEl) mountEl.dataset.fixedHeight = String(mountH);
    } catch (_) {}
    return mountH;
  }
  
  // fallback for small screens or when height not yet computed
  const viewportH = Math.max(
    Number(window?.innerHeight || 0),
    Number(document?.documentElement?.clientHeight || 0),
    fallback
  );
  const hostRect = host?.getBoundingClientRect?.() || { top: 0 };
  const top = Number(hostRect.top || 0);
  const computed = Math.max(fallback, viewportH - top - 100);
  const result = Math.min(computed, 850);
  
  try {
    if (mountEl) mountEl.dataset.fixedHeight = String(result);
  } catch (_) {}
  return result;
}
