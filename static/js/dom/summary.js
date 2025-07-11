// static/js/dom/summary.js

import { subscribe } from "../state/eventBus.js";

/**
 * Initializes the summary component by subscribing to data changes.
 */
export function initSummary() {
  subscribe("appState:dataChanged", (newData) => {
    console.log("[Event] appState:dataChanged triggered summary update.");

    const container = document.getElementById("summaryMetrics");
    if (!container) return; // Exit if the container doesn't exist

    // If there is new data with metrics, render it and show the container.
    if (newData?.today_metrics) {
      renderSummaryMetrics(newData.today_metrics, newData.yesterday_metrics);
      container.style.display = "flex"; // Make it visible
    } else {
      // If data is cleared (e.g., by clicking Reverse), clear and hide the container.
      container.innerHTML = "";
      container.style.display = "none";
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
  container.style.display = "flex"; // Use flex for side-by-side layout.
}

/**
 * Helper function to create a single block for a set of metrics.
 * @param {string} title - The title for the block (e.g., "Today").
 * @param {Object} metrics - The metrics object to display.
 * @returns {HTMLElement} A div element containing the formatted metrics.
 */
function createMetricsBlock(title, metrics) {
  const block = document.createElement("div");
  // You can add a class here for styling, e.g., block.classList.add('summary-card');

  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  block.appendChild(titleEl);

  // Check if metrics object is valid.
  if (metrics && Object.keys(metrics).length > 0) {
    // Loop through each metric and create a line for it.
    for (const key in metrics) {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${key}: `;

      p.appendChild(strong);
      p.append(metrics[key]); // Use append to safely add the value.
      block.appendChild(p);
    }
  } else {
    // Display a message if no metrics are available.
    const p = document.createElement("p");
    p.textContent = "No data available.";
    block.appendChild(p);
  }

  return block;
}
