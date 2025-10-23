// static/js/charts/hybridChart.js
// Hybrid chart: bars + line overlaid
import * as d3 from 'd3';

/**
 * data format: { bars: Array<{x, y}>, line: Array<{x, y}> }
 */
export function renderHybridChart(container, data = { bars: [], line: [] }, opts = {}) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) return;
  const width = opts.width || root.clientWidth || 700;
  const height = opts.height || 300;
  const margin = { top: 20, right: 40, bottom: 40, left: 50, ...(opts.margin || {}) };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = Math.max(10, height - margin.top - margin.bottom);

  const bars = (data.bars || []).map(d => ({ x: d.x, y: +d.y })).filter(d => isFinite(d.y));
  const line = (data.line || []).map(d => ({ x: d.x instanceof Date ? d.x : (typeof d.x === 'number' ? new Date(d.x) : new Date(d.x)), y: +d.y })).filter(d => Number.isFinite(d.y) && !isNaN(d.x?.getTime()));

  root.innerHTML = '';
  if (bars.length === 0 && line.length === 0) return;

  const xDomain = bars.length ? bars.map(d => d.x) : line.map(d => d.x);
  const isTime = line.length > 0;

  const x = isTime
    ? d3.scaleUtc().domain(d3.extent(line, d => d.x)).range([0, innerW])
    : d3.scaleBand().domain(xDomain).range([0, innerW]).padding(0.2);

  const maxY = Math.max(
    d3.max(bars, d => d.y) || 0,
    d3.max(line, d => d.y) || 0
  );
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

  const svg = d3.select(root).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Axes
  g.append('g').attr('transform', `translate(0,${innerH})`).call(isTime ? d3.axisBottom(x).ticks(6) : d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y).ticks(5));

  // Bars
  if (!isTime && bars.length) {
    g.selectAll('rect')
      .data(bars)
      .enter().append('rect')
      .attr('x', d => x(d.x))
      .attr('y', d => y(d.y))
      .attr('width', x.bandwidth())
      .attr('height', d => innerH - y(d.y))
      .attr('fill', opts.barColor || '#89aaff');
  }

  // Line
  if (line.length) {
    const lineGen = d3.line().x(d => x(d.x)).y(d => y(d.y));
    g.append('path')
      .datum(line)
      .attr('fill', 'none')
      .attr('stroke', opts.lineColor || '#2f6feb')
      .attr('stroke-width', 2)
      .attr('d', lineGen);
  }
}
