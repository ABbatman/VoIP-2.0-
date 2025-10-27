// static/js/charts/multiLineChart.js
// Stacked small-multiples line chart: TCalls, ASR, Minutes, ACD in one SVG

import * as d3 from 'd3';

/**
 * Renders 4 stacked line charts in a single SVG without increasing outer area.
 * seriesMap keys expected: TCalls, ASR, Minutes, ACD
 * @param {HTMLElement|string} container
 * @param {{[name:string]: Array<{x: Date|number|string, y: number|null}>}} seriesMap
 * @param {{ width?: number, height?: number, margin?: {top:number,right:number,bottom:number,left:number}, colors?: {[k:string]:string} }} opts
 */
export function renderMultiLineChart(container, seriesMap = {}, opts = {}) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) return;

  const bb = root.getBoundingClientRect();
  const cssH = parseFloat((getComputedStyle(root).height || '').replace('px','')) || 0;
  const parentH = root.parentElement ? (root.parentElement.clientHeight || root.parentElement.getBoundingClientRect().height || 0) : 0;
  const measuredH = Math.max(cssH, root.clientHeight || 0, bb.height || 0, parentH || 0);
  const width = opts.width || Math.max(200, Math.floor(bb.width || root.clientWidth || 600));
  const height = opts.height || Math.max(220, Math.floor(measuredH || 280));
  const margin = Object.assign({ top: 12, right: 16, bottom: 20, left: 40 }, opts.margin || {});
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = Math.max(10, height - margin.top - margin.bottom);

  const names = ['TCalls', 'ASR', 'Minutes', 'ACD'];
  const mainBlue = '#4f86ff';
  const colors = Object.assign({
    TCalls: mainBlue,
    ASR: mainBlue,
    Minutes: mainBlue,
    ACD: mainBlue,
  }, opts.colors || {});

  // Normalize series
  const normalized = {};
  names.forEach(n => {
    const s = (seriesMap[n] || []).map(d => ({
      x: d.x instanceof Date ? d.x : (typeof d.x === 'number' ? new Date(d.x) : new Date(d.x)),
      y: d.y == null ? null : +d.y,
    })).filter(d => !isNaN(d.x?.getTime()));
    normalized[n] = s;
  });
  if (names.every(n => (normalized[n] || []).length === 0)) { root.innerHTML = ''; return; }

  // Debug: for 5m raw mode (noDefined=true) log total points across all series
  if (opts && opts.noDefined === true) {
    try {
      const total = names.reduce((acc, n) => acc + ((normalized[n] && normalized[n].length) || 0), 0);
      console.log('5m render points:', total);
    } catch(_) {}
  }

  // Even segmentation: split innerH equally into 4 segments
  const segmentH = innerH / names.length;

  root.innerHTML = '';
  const svg = d3.select(root)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const defs = svg.append('defs');

  const allPoints = names.flatMap(n => normalized[n]);
  // Support explicit x-domain (e.g., [fromTs, toTs]) to keep window stable across step switches and zoom
  let providedDomain = null;
  try {
    if (Array.isArray(opts.xDomain) && opts.xDomain.length === 2) {
      const a = opts.xDomain[0] instanceof Date ? opts.xDomain[0] : new Date(opts.xDomain[0]);
      const b = opts.xDomain[1] instanceof Date ? opts.xDomain[1] : new Date(opts.xDomain[1]);
      if (isFinite(a.getTime()) && isFinite(b.getTime())) providedDomain = [a, b];
    } else if (Number.isFinite(opts.fromTs) && Number.isFinite(opts.toTs)) {
      providedDomain = [new Date(opts.fromTs), new Date(opts.toTs)];
    }
  } catch(_) { /* ignore */ }
  const dataExtent = d3.extent(allPoints, d => d.x);
  let globalX = providedDomain || dataExtent;
  // Clamp domain to the actual data window inside the requested range (no filtering of series)
  try {
    const finitePoints = names.flatMap(n => (normalized[n] || [])).filter(p => p && p.x instanceof Date && isFinite(p.x));
    if (finitePoints.length) {
      const leftData = d3.min(finitePoints, d => d.x);
      const rightData = d3.max(finitePoints, d => d.x);
      let start = globalX && globalX[0] ? globalX[0] : leftData;
      let end = globalX && globalX[1] ? globalX[1] : rightData;
      // If requested window starts before first data, snap to first data
      if (start < leftData) start = leftData;
      // If requested window ends after last data, snap to last data
      if (end > rightData) end = rightData;
      if (end > start) globalX = [start, end];
    }
  } catch(_) {}
  const panels = [];
  const bisect = d3.bisector(d => d.x).left;

  names.forEach((name, idx) => {
    const yDomain = (() => {
      const vals = normalized[name].map(d => d.y).filter(v => v != null && isFinite(v));
      const max = d3.max(vals) || 0;
      return [0, max === 0 ? 1 : max];
    })();
    const x = d3.scaleUtc().domain(globalX).range([0, innerW]);
    // leave space for title (top) and axis (bottom) inside the panel
    const titlePad = 14;
    const bottomPad = 10;
    const plotH = Math.max(8, Math.floor(segmentH - titlePad - bottomPad));
    const y = d3.scaleLinear().domain(yDomain).nice().range([plotH, 0]);

    const def = (d) => d.y != null && isFinite(d.y);
    const line = d3.line()
      .curve(d3.curveMonotoneX)
      .defined(opts && opts.noDefined === true ? () => true : def)
      .x(d => x(d.x))
      .y(d => y(d.y));
    const area = d3.area()
      .curve(d3.curveMonotoneX)
      .defined(opts && opts.noDefined === true ? () => true : def)
      .x(d => x(d.x))
      .y0(y(0))
      .y1(d => y(d.y));

    const panelY = Math.round(idx * segmentH);
    const panel = g.append('g').attr('transform', `translate(0,${panelY})`);
    const plot = panel.append('g').attr('transform', `translate(0,${titlePad})`);

    // Axes: render X for every panel since each has its own domain
    plot.append('g')
      .attr('transform', `translate(0,${plotH})`)
      .call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));

    // Y-axis: keep the axis line (black) but hide tick labels (relative scale)
    plot.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y).ticks(3).tickSize(0).tickFormat(() => ''))
      .call(g => g.selectAll('path.domain').attr('stroke', '#000').attr('stroke-width', 1))
      .call(g => g.selectAll('line').attr('stroke', '#000').attr('stroke-width', 1));

    // Title label
    panel.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', '#57606a')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text(name);

    const gradId = `area-grad-${idx}`;
    const stopColor = colors[name] || mainBlue;
    const grad = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%').attr('x2', '0%')
      .attr('y1', '0%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', stopColor).attr('stop-opacity', 0.18);
    grad.append('stop').attr('offset', '100%').attr('stop-color', stopColor).attr('stop-opacity', 0.02);

    plot.append('path')
      .datum(normalized[name])
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', 'none')
      .attr('d', area);

    plot.append('path')
      .datum(normalized[name])
      .attr('fill', 'none')
      .attr('stroke', stopColor)
      .attr('stroke-width', 1.8)
      .attr('d', line);

    // Tooltip focus group (circle + text)
    const focus = plot.append('g').attr('class', 'chart-focus').style('display', 'none');
    focus.append('circle')
      .attr('r', 4.2)
      .attr('fill', stopColor)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);
    // Text background (white outline)
    focus.append('text')
      .attr('class', 'focus-text-bg')
      .attr('x', 8)
      .attr('y', -8)
      .attr('fill', '#fff')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('paint-order', 'stroke')
      .text('');
    // Foreground text
    focus.append('text')
      .attr('class', 'focus-text-fg')
      .attr('x', 8)
      .attr('y', -8)
      .attr('fill', '#111')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .text('');
    focus.append('line')
      .attr('class', 'focus-hline')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 0)
      .attr('stroke', '#bbb')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3');

    panels.push({ name, idx, x, y, plot, data: normalized[name], focus, color: stopColor, plotH, titlePad });
  });

  // Crosshair vertical line across all panels
  const crosshair = g.append('line')
    .attr('class', 'chart-crosshair')
    .attr('y1', 0)
    .attr('y2', innerH)
    .attr('stroke', '#888')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3')
    .style('display', 'none');

  // Transparent overlay capturing mouse events (entire plots area)
  g.append('rect')
    .attr('class', 'chart-overlay')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('mousemove', function (event) {
      const [mx, my] = d3.pointer(event, this);
      // Use first panel x-scale (all share same domain/range)
      const px = panels[0]?.x || d3.scaleUtc().domain(globalX).range([0, innerW]);
      const xDate = px.invert(mx);
      let anyShown = false;

      panels.forEach(p => {
        const { data, x, y, focus, titlePad, name } = p;
        if (!data || data.length === 0) { focus.style('display', 'none'); return; }
        const i = Math.max(0, Math.min(bisect(data, xDate), data.length - 1));
        const d0 = data[Math.max(0, i - 1)];
        const d1 = data[i];
        const d = (!d0 || (d1 && (xDate - d0.x > d1.x - xDate))) ? d1 : d0;
        if (!d || d.y == null || !isFinite(d.y)) { focus.style('display', 'none'); return; }
        const tx = x(d.x);
        const ty = y(d.y);
        focus.attr('transform', `translate(${tx},${ty})`).style('display', null);
        const txt = (name === 'TCalls') ? String(Math.round(d.y)) : (Math.round(d.y * 10) / 10).toFixed(1);
        focus.select('text.focus-text-bg').text(txt);
        focus.select('text.focus-text-fg').text(txt);
        try {
          focus.select('line')
            .attr('x1', -tx)
            .attr('y1', 0)
            .attr('x2', innerW - tx)
            .attr('y2', 0);
        } catch(_) {}
        anyShown = true;
      });

      if (anyShown) {
        crosshair.attr('x1', mx).attr('x2', mx).style('display', null);
      } else {
        crosshair.style('display', 'none');
      }
    })
    .on('mouseleave', function () {
      panels.forEach(p => p.focus.style('display', 'none'));
      crosshair.style('display', 'none');
    });
}
