// static/js/dom/ui-feedback.js
// This module is responsible for providing visual feedback to the user
// based on the application's global status.

import { subscribe } from "../state/eventBus.js";
import { getMetricsData } from "../state/appState.js";

/**
 * Initializes the UI feedback listeners.
 */
export function initUiFeedback() {
  // Subscribe to status changes and call the update function.
  subscribe("appState:statusChanged", updateFeedbackUI);
  console.log(
    "👂 UI Feedback module initialized and listening for status changes."
  );
}

/**
 * Updates the UI based on the new application status.
 * @param {'idle' | 'loading' | 'success' | 'error'} status
 */
function updateFeedbackUI(status) {
  const findButton = document.getElementById("findButton");
  const tableBody = document.getElementById("tableBody");
  const controlButtons = document.querySelectorAll(".table-mode-button");

  // First, reset all buttons to their default state
  findButton.disabled = false;
  findButton.textContent = "Find";
  controlButtons.forEach((btn) => (btn.disabled = false));

  // Then, apply changes based on the new status
  switch (status) {
    case "loading":
      // The button text is updated to show the loading state.
      findButton.disabled = true;
      findButton.textContent = "Finding...";
      controlButtons.forEach((btn) => (btn.disabled = true));
      // We no longer write status messages into the table body.
      break;

    // The 'success' status is now handled by the component that displays the data.
    // We no longer show a generic message here.
    case "success":
      // The button text "Find" is restored automatically at the top of the function.
      // The summary metrics will appear on their own.
      // The table will be rendered only when the user clicks "Summary Table".
      // This case can now be empty.
      break;

    case "error":
      if (tableBody)
        tableBody.innerHTML = `<tr><td colspan="24">Failed to load data. Please check console for errors.</td></tr>`;
      break;

    case "idle":
      // This is the default state, nothing specific to do here as we already reset.
      break;
  }
}
