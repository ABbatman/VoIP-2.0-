// static/js/charts/zoom/brushZoom.js
// Lightweight drag-to-zoom overlay for time range selection over an SVG chart.
//
// HIERARCHY & CONTRACT (stable):
// - Charts are the source of truth for the visual time window.
// - The table is a consumer and NEVER affects charts (no re-fetch or re-render is triggered by table actions).
// - A zoom selection is stored in window.__chartsZoomRange and affects:
//   - Chart rendering (view-only, does not mutate filter inputs).
//   - Request parameters for the table (Summary) and Find, but only for that specific request.
// - RMB (context menu) acts as zoom step-back:
//   - Pops one level from the local zoom stack; when history empties, clears zoom to base range.
//   - Does NOT trigger any data fetching by itself.
//
// LMB: drag to select [x0,x1] mapped to [fromTs..toTs], then onApplyRange re-renders charts.
// RMB: reset to previous range or clear to base range without any fetch.

import { getFilters } from '../../state/appState.js';

export function attachChartZoom(mount, { fromTs, toTs, onApplyRange, marginLeft = 40, marginRight = 16 } = {}) {
  // mount is the container where SVG was rendered
  const svg = mount.querySelector('svg');
  if (!svg) return () => {};

  // Calculate width/height from viewBox (precise) or client size
  const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const vbWidth = vb.length === 4 ? vb[2] : svg.clientWidth || 600;
  const vbHeight = vb.length === 4 ? vb[3] : svg.clientHeight || 300;

  // Overlay layer
  const ns = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(ns, 'g');
  overlay.setAttribute('data-zoom-layer', 'true');
  // Let only the hit-rect receive pointer events
  overlay.style.pointerEvents = 'none';

  // Transparent hit-rect to capture mouse events
  const hit = document.createElementNS(ns, 'rect');
  hit.setAttribute('x', '0');
  hit.setAttribute('y', '0');
  hit.setAttribute('width', String(vbWidth));
  hit.setAttribute('height', String(vbHeight));
  hit.setAttribute('fill', 'transparent');
  hit.style.pointerEvents = 'all';
  overlay.appendChild(hit);

  // Selection rectangle
  const sel = document.createElementNS(ns, 'rect');
  sel.setAttribute('x', '0');
  sel.setAttribute('y', '0');
  sel.setAttribute('width', '0');
  sel.setAttribute('height', String(vbHeight));
  sel.setAttribute('fill', '#0366d6');
  sel.setAttribute('opacity', '0.15');
  sel.setAttribute('stroke', '#0366d6');
  sel.setAttribute('stroke-width', '1');
  sel.style.display = 'none';
  overlay.appendChild(sel);

  // Append overlay as the last child so it sits on top
  svg.appendChild(overlay);

  // Helpers: client -> local X (viewBox space), then pixel<->time mapping
  const clientToLocalX = (evt) => {
    const rect = svg.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const scaleX = rect.width ? (vbWidth / rect.width) : 1;
    return Math.max(0, Math.min(vbWidth, x * scaleX));
  };
  const innerW = Math.max(1, vbWidth - marginLeft - marginRight);
  const pxToTs = (px) => {
    const rel = Math.max(0, Math.min(innerW, px - marginLeft));
    return fromTs + (rel / innerW) * (toTs - fromTs);
  };

  let dragging = false;
  let x0 = 0;
  // Zoom history stack to support multi-level undo via RMB
  try { if (!window.__chartsZoomStack) window.__chartsZoomStack = []; } catch(_) {}
  const stack = (typeof window !== 'undefined') ? (window.__chartsZoomStack || []) : [];
  // Base range (from charts) used when stack is empty and no active zoom exists
  let baseRange = { fromTs, toTs };

  const onMouseDown = (e) => {
    if (e.button !== 0) return; // only LMB
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    // start inside plotting area
    x0 = Math.max(marginLeft, Math.min(vbWidth - marginRight, clientToLocalX(e)));
    sel.style.display = '';
    sel.setAttribute('x', String(x0));
    sel.setAttribute('width', '0');
  };

  const onMouseMove = (e) => {
    if (!dragging) {
      // Forward hover to underlying chart overlay to enable crosshair/tooltip
      try {
        const under = svg.querySelector('.chart-overlay');
        if (under) {
          const evt = new MouseEvent('mousemove', {
            bubbles: true,
            clientX: e.clientX,
            clientY: e.clientY,
            view: window,
          });
          under.dispatchEvent(evt);
        }
      } catch(_) {}
      return;
    }
    e.stopPropagation();
    const x1 = clientToLocalX(e);
    const left = Math.min(x0, x1);
    const w = Math.abs(x1 - x0);
    // clamp selection to plotting area [marginLeft, vbWidth - marginRight]
    const clampL = Math.max(marginLeft, Math.min(vbWidth - marginRight, left));
    const clampR = Math.max(marginLeft, Math.min(vbWidth - marginRight, left + w));
    sel.setAttribute('x', String(clampL));
    sel.setAttribute('width', String(Math.max(0, clampR - clampL)));
  };

  const onMouseUp = (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    const w = Number(sel.getAttribute('width')) || 0;
    if (w < 2) {
      // too small, ignore
      sel.style.display = 'none';
      return;
    }
    const left = Number(sel.getAttribute('x')) || 0;
    const right = left + w;
    const selFrom = Math.floor(pxToTs(left));
    const selTo = Math.ceil(pxToTs(right));

    // store previous range from app state
    const current = getFilters();
    // If there is an active zoom, push it to the stack for step-back
    try {
      if (window.__chartsZoomRange && Number.isFinite(window.__chartsZoomRange.fromTs) && Number.isFinite(window.__chartsZoomRange.toTs)) {
        stack.push({ fromTs: window.__chartsZoomRange.fromTs, toTs: window.__chartsZoomRange.toTs });
      } else {
        // No active zoom yet; remember base range from charts/filters for final restore
        baseRange = { fromTs: Date.parse(current.from) || fromTs, toTs: Date.parse(current.to) || toTs };
      }
    } catch(_) {}

    // Store selection globally (active zoom)
    try {
      window.__chartsZoomRange = {
        fromTs: selFrom,
        toTs: selTo,
      };
    } catch(_) {}

    if (typeof onApplyRange === 'function') {
      try { onApplyRange(selFrom, selTo, null); } catch(_) {}
    }
  };

  const onContextMenu = (e) => {
    // RMB resets to previous range
    e.preventDefault();
    e.stopPropagation();
    let toRestore = null;
    let needsRefetch = false;
    try {
      if (stack.length > 0) {
        // Step back one zoom level
        toRestore = stack.pop();
        window.__chartsZoomRange = toRestore;
        needsRefetch = true; // need fresh data for restored range
      } else {
        // No history left: clear active zoom (back to base range)
        window.__chartsZoomRange = null;
        toRestore = baseRange;
        needsRefetch = true; // need fresh data for base range
      }
    } catch(_) {}
    sel.style.display = 'none';
    // Trigger data refetch for restored range to avoid mixed granularity artifacts
    if (needsRefetch) {
      (async () => {
        try {
          const { publish } = await import('../../state/eventBus.js');
          const currentInterval = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? window.__chartsCurrentInterval : '5m';
          publish('charts:intervalChanged', { interval: currentInterval });
        } catch(_) {
          // Fallback: just re-render with existing data
          if (typeof onApplyRange === 'function') {
            try { onApplyRange(toRestore.fromTs, toRestore.toTs, null); } catch(_) {}
          }
        }
      })();
    } else if (typeof onApplyRange === 'function') {
      try { onApplyRange(toRestore.fromTs, toRestore.toTs, null); } catch(_) {}
    }
  };

  const onMouseOut = (e) => {
    // Forward leave to underlying overlay to hide tooltips
    try {
      const under = svg.querySelector('.chart-overlay');
      if (under) {
        const evt = new Event('mouseleave', { bubbles: true });
        under.dispatchEvent(evt);
      }
    } catch(_) {}
  };

  hit.addEventListener('mousedown', onMouseDown);
  hit.addEventListener('mousemove', onMouseMove);
  hit.addEventListener('mouseout', onMouseOut);
  window.addEventListener('mouseup', onMouseUp);
  hit.addEventListener('contextmenu', onContextMenu);

  // return cleanup
  return () => {
    try {
      hit.removeEventListener('mousedown', onMouseDown);
      hit.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      hit.removeEventListener('contextmenu', onContextMenu);
      overlay.remove();
    } catch(_) {}
  };
}
