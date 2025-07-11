// static/js/dom/filters.js

import { fetchMetrics } from "../data/fetchMetrics.js";
import {
  isReverseMode,
  setReverseMode,
  setMetricsData,
  getMetricsData,
  setAppStatus,
} from "../state/appState.js";
import { saveStateToUrl } from "../state/urlState.js";
import { hideTableUI, showTableControls } from "./table-ui.js";
import { initTableControls } from "./table-controls.js";
import { initFlatpickr, initTimeControls } from "./ui-widgets.js";
import { buildFilterParams, setDefaultDateRange } from "./filter-helpers.js";

/**
 * Central initialization function for all filter-related elements.
 * @param {boolean} isStateLoaded - Flag indicating if state was loaded from URL.
 */
export function initFilters(isStateLoaded) {
  console.log("🚀 Initializing filters...");

  const findButton = document.getElementById("findButton");
  const summaryTableButton = document.getElementById("btnSummary");
  const reverseButton = document.getElementById("btnReverse");

  initFlatpickr();
  initTimeControls();

  if (!isStateLoaded) {
    setDefaultDateRange();
  }

  if (findButton) {
    findButton.addEventListener("click", handleFindClick);
  }

  if (summaryTableButton) {
    summaryTableButton.addEventListener("click", handleSummaryClick);
  }

  if (reverseButton) {
    reverseButton.addEventListener("click", handleReverseClick);
  }
}

/**
 * Handles the "Find" button click. Fetches data from the API.
 */
async function handleFindClick() {
  console.log(
    "🔍 Find button clicked. Hiding old results and setting status to 'loading'."
  );
  setAppStatus("loading");

  // Hide UI elements immediately
  const resultsContainer = document.querySelector(".results-display");
  if (resultsContainer) {
    resultsContainer.style.display = "none";
  }
  hideTableUI();

  try {
    const filterParams = buildFilterParams();
    if (!filterParams.from || !filterParams.to) {
      throw new Error("Date range is not set. Cannot fetch metrics.");
    }
    const data = await fetchMetrics(filterParams);

    // Set the new data. This will trigger summary updates via the event bus.
    setMetricsData(data);

    // After data is loaded, change status to success.
    // The UI (summary metrics) will react to the 'dataChanged' event.
    // The table will wait for a 'Summary Table' click.
    setAppStatus("success");
    saveStateToUrl();
  } catch (error) {
    console.error("Error during fetch operation:", error);
    setAppStatus("error");
  }
}

/**
 * Handles the "Summary Table" button click. Shows the detailed table.
 */
function handleSummaryClick() {
  console.log("📊 Summary Table button clicked.");

  const appData = getMetricsData();
  const { main_rows, peer_rows } = appData || {};
  const resultsContainer = document.querySelector(".results-display");
  if (!resultsContainer) return;

  if (main_rows?.length > 0 || peer_rows?.length > 0) {
    resultsContainer.style.display = "block";
    // Initialize or re-initialize table controls with the fresh data
    initTableControls(main_rows, peer_rows);
  } else {
    resultsContainer.style.display = "none";
    hideTableUI();
    // Only show alert if user physically clicked the button when there's no data
    const summaryBtn = document.getElementById("btnSummary");
    if (document.activeElement === summaryBtn) {
      alert('No data to display. Please click "Find" first.');
    }
  }
}

/**
 * Handles the reverse mode toggle.
 */
function handleReverseClick() {
  console.log(
    "🔄 Reverse button clicked. Toggling state and re-fetching data in background."
  );

  // 1. Toggle the reverse mode state.
  setReverseMode(!isReverseMode());

  // 2. Automatically trigger a new "Find" operation in the background.
  // The user will see "Finding..." and the summary metrics will update,
  // but the main table will remain hidden until they click "Summary Table".
  handleFindClick();
}
