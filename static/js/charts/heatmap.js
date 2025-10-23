// static/js/charts/heatmap.js
// Simple D3 heatmap renderer
import * as d3 from 'd3';

/**
 * @param {HTMLElement|string} container
 * @param {Array<{x: string|number, y: string|number, v: number}>} data - cells
 * @param {Object} opts
 */
export function renderHeatmap(container, data = [], opts = {}) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) return;
  const width = opts.width || root.clientWidth || 700;
  const height = opts.height || 360;
  const margin = { top: 24, right: 16, bottom: 40, left: 60, ...(opts.margin || {}) };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = Math.max(10, height - margin.top - margin.bottom);

  const xs = Array.from(new Set((data || []).map(d => d.x)));
  const ys = Array.from(new Set((data || []).map(d => d.y)));
  const values = (data || []).map(d => +d.v).filter(Number.isFinite);

  root.innerHTML = '';
  if (xs.length === 0 || ys.length === 0) return;

  const x = d3.scaleBand().domain(xs).range([0, innerW]).padding(0.05);
  const y = d3.scaleBand().domain(ys).range([innerH, 0]).padding(0.05);
  const color = d3.scaleSequential(d3.interpolateTurbo)
    .domain([d3.min(values) ?? 0, d3.max(values) ?? 1]);

  const svg = d3.select(root).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y));

  g.selectAll('rect')
    .data(data)
    .enter().append('rect')
      .attr('x', d => x(d.x))
      .attr('y', d => y(d.y))
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', d => color(+d.v || 0));
}
