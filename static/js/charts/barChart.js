// static/js/charts/barChart.js
// Reusable D3 bar chart renderer (vertical bars)
import * as d3 from 'd3';

/**
 * @param {HTMLElement|string} container
 * @param {Array<{x: string|number, y: number}>} data
 * @param {Object} opts
 */
export function renderBarChart(container, data = [], opts = {}) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) return;
  const width = opts.width || root.clientWidth || 600;
  const height = opts.height || 260;
  const margin = { top: 16, right: 16, bottom: 40, left: 44, ...(opts.margin || {}) };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = Math.max(10, height - margin.top - margin.bottom);

  const parsed = (data || []).map(d => ({ x: d.x, y: +d.y })).filter(d => isFinite(d.y));
  root.innerHTML = '';
  if (parsed.length === 0) return;

  const x = d3.scaleBand().domain(parsed.map(d => d.x)).range([0, innerW]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(parsed, d => d.y) || 0]).nice().range([innerH, 0]);

  const svg = d3.select(root).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y).ticks(5));

  g.selectAll('rect')
    .data(parsed)
    .enter().append('rect')
    .attr('x', d => x(d.x))
    .attr('y', d => y(d.y))
    .attr('width', x.bandwidth())
    .attr('height', d => innerH - y(d.y))
    .attr('fill', opts.color || '#2f6feb');
}
