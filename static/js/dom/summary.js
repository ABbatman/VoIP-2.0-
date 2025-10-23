// static/js/dom/summary.js

import { subscribe } from "../state/eventBus.js";

/**
 * Initializes the summary component by subscribing to data changes.
 */
export function initSummary() {
  subscribe("appState:dataChanged", (newData) => {
    const container = document.getElementById("summaryMetrics");
    if (!container) return;

    // Check both today and yesterday metrics
    const hasTodayData = newData?.today_metrics && Object.keys(newData.today_metrics).length > 0;
    const hasYesterdayData = newData?.yesterday_metrics && Object.keys(newData.yesterday_metrics).length > 0;

    if (hasTodayData || hasYesterdayData) {
      renderSummaryMetrics(newData.today_metrics || {}, newData.yesterday_metrics || {});
      container.classList.remove('is-hidden');
    } else {
      container.innerHTML = "";
      container.classList.add('is-hidden');
    }
  });
}

/**
 * Renders the summary metrics blocks for today and yesterday.
 * @param {Object} today - The 'today_metrics' object from the API.
 * @param {Object} yesterday - The 'yesterday_metrics' object from the API.
 */
function renderSummaryMetrics(today, yesterday) {
  // Find the main container for the summary blocks.
  const container = document.getElementById("summaryMetrics");
  if (!container) {
    console.error("Summary metrics container not found!");
    return;
  }

  // Clear any previous content.
  container.innerHTML = "";

  // Create and fill the block for today's metrics.
  const todayBlock = createMetricsBlock("Today", today);
  container.appendChild(todayBlock);

  // Create and fill the block for yesterday's metrics.
  const yesterdayBlock = createMetricsBlock("Yesterday", yesterday);
  container.appendChild(yesterdayBlock);

  // Make the container visible.
  container.classList.remove('is-hidden');
}

/**
 * Helper function to create a single block for a set of metrics.
 * @param {string} title - The title for the block (e.g., "Today").
 * @param {Object} metrics - The metrics object to display.
 * @returns {HTMLElement} A div element containing the formatted metrics.
 */
function createMetricsBlock(title, metrics) {
  const block = document.createElement("div");
  block.classList.add('summary-card');
  if (title.toLowerCase() === 'today') {
    block.classList.add('summary-today');
  } else if (title.toLowerCase() === 'yesterday') {
    block.classList.add('summary-yesterday');
  }

  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  block.appendChild(titleEl);

  if (metrics && Object.keys(metrics).length > 0) {
    for (const key in metrics) {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${key}: `;

      const valueSpan = document.createElement("span");
      valueSpan.classList.add("metric-value");
      valueSpan.textContent = metrics[key];

      p.appendChild(strong);
      p.appendChild(valueSpan);
      block.appendChild(p);
    }
  } else {
    const p = document.createElement("p");
    p.textContent = "No data available.";
    block.appendChild(p);
  }

  return block;
}
