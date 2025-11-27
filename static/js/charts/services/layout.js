// static/js/charts/services/layout.js
// layout utils for charts

export function ensureFixedChartHeight(host, mount) {
  // Keep charts a uniform, smaller height (fixed 260px)
  const fallback = 520;
  const controlsEl = document.getElementById('charts-controls');
  const controlsH = controlsEl ? (controlsEl.clientHeight || controlsEl.getBoundingClientRect().height || 0) : 0;
  // Container height may be too small immediately after show; fallback to viewport
  const containerRect = host?.getBoundingClientRect?.() || { top: 0, height: 0 };
  const containerH = Number(host?.clientHeight || containerRect.height || 0);
  const viewportH = Math.max(
    Number(window?.innerHeight || 0),
    Number(document?.documentElement?.clientHeight || 0),
    fallback
  );
  const top = Number(containerRect.top || 0);
  let base = containerH;
  if (!base || base < 300) {
    // Estimate available space from viewport bottom to container top
    base = Math.max(fallback, viewportH - top - 24);
  }
  const fixed = 850; // px
  try {
    if (host) {
      // Ensure host expands to accommodate mount height
      // Ensure host expands to accommodate mount height
      // host.style.minHeight = `${fixed + controlsH + 8}px`;
    }
    if (mount) {
      // mount.style.height = `${fixed}px`;
      // mount.style.minHeight = `${fixed}px`;
      mount.dataset.fixedHeight = String(fixed);
    }
  } catch (_) {
    // ignore
  }
  return fixed;
}
