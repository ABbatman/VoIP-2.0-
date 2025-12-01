// static/js/dom/summary.js
// Responsibility: Render summary metrics (today/yesterday)
import { subscribe } from '../state/eventBus.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CONTAINER_ID = 'summaryMetrics';
const HIDDEN_CLASS = 'is-hidden';

const CLASSES = {
  card: 'summary-card',
  today: 'summary-today',
  yesterday: 'summary-yesterday',
  metricValue: 'metric-value'
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function hasData(metrics) {
  return metrics && Object.keys(metrics).length > 0;
}

function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

// ─────────────────────────────────────────────────────────────
// DOM creation
// ─────────────────────────────────────────────────────────────

function createMetricRow(key, value) {
  const p = document.createElement('p');

  const strong = document.createElement('strong');
  strong.textContent = `${key}: `;

  const span = document.createElement('span');
  span.className = CLASSES.metricValue;
  span.textContent = value;

  p.appendChild(strong);
  p.appendChild(span);
  return p;
}

function createMetricsBlock(title, metrics) {
  const block = document.createElement('div');
  block.className = CLASSES.card;

  // add period-specific class
  const period = title.toLowerCase();
  if (period === 'today') block.classList.add(CLASSES.today);
  if (period === 'yesterday') block.classList.add(CLASSES.yesterday);

  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  block.appendChild(titleEl);

  if (hasData(metrics)) {
    Object.entries(metrics).forEach(([key, value]) => {
      block.appendChild(createMetricRow(key, value));
    });
  } else {
    const p = document.createElement('p');
    p.textContent = 'No data available.';
    block.appendChild(p);
  }

  return block;
}

// ─────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────

function renderSummaryMetrics(today, yesterday) {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = '';
  container.appendChild(createMetricsBlock('Today', today));
  container.appendChild(createMetricsBlock('Yesterday', yesterday));
  container.classList.remove(HIDDEN_CLASS);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initSummary() {
  subscribe('appState:dataChanged', (data) => {
    const container = getContainer();
    if (!container) return;

    const hasTodayData = hasData(data?.today_metrics);
    const hasYesterdayData = hasData(data?.yesterday_metrics);

    if (hasTodayData || hasYesterdayData) {
      renderSummaryMetrics(data.today_metrics || {}, data.yesterday_metrics || {});
    } else {
      container.innerHTML = '';
      container.classList.add(HIDDEN_CLASS);
    }
  });
}
