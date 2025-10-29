// static/js/dom/ui-feedback.js
// This module is responsible for providing visual feedback to the user
// based on the application's global status.

import { subscribe } from "../state/eventBus.js";

let __lastDataEmpty = false;

// --- NEW: Helper function to show a toast notification ---
/**
 * Creates and displays a toast notification.
 * @param {string} message - The message to display in the toast.
 * @param {'success' | 'error'} type - The type of toast, for styling.
 */
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger the animation
  setTimeout(() => {
    toast.classList.add("show");
  }, 100); // Small delay to allow element to be added to DOM

  // Remove the toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove("show");
    // Remove the element from DOM after the fade-out animation ends
    toast.addEventListener("transitionend", () => toast.remove());
  }, 3000);
}

/**
 * Initializes the UI feedback listeners.
 */
export function initUiFeedback() {
  // Subscribe to status changes and call the update function.
  subscribe("appState:statusChanged", updateFeedbackUI);
  // Track whether the last received dataset is empty to adjust messages
  subscribe("appState:dataChanged", (data) => {
    const hasAny = !!(Array.isArray(data?.main_rows) && data.main_rows.length) ||
                   !!(Array.isArray(data?.peer_rows) && data.peer_rows.length) ||
                   !!(Array.isArray(data?.hourly_rows) && data.hourly_rows.length);
    __lastDataEmpty = !hasAny;
  });
  console.log(
    "👂 UI Feedback module initialized and listening for status changes."
  );
}

/**
 * Updates the UI based on the new application status.
 * @param {'idle' | 'loading' | 'success' | 'error'} status
 */
function updateFeedbackUI(status) {
  console.log("🔍 updateFeedbackUI: Updating UI for status:", status);
  
  const findButton = document.getElementById("findButton");
  const controlButtons = document.querySelectorAll(".btn");
  const loadingOverlay = document.getElementById("loading-overlay");

  console.log("🔍 updateFeedbackUI: UI elements found:", {
    findButton: !!findButton,
    controlButtons: controlButtons.length,
    loadingOverlay: !!loadingOverlay
  });

  // --- MODIFIED: Handle all UI elements consistently ---

  // Default state: enable buttons, hide overlay
  if (findButton) {
    findButton.disabled = false;
    findButton.textContent = "Find";
  }
  controlButtons.forEach((btn) => (btn.disabled = false));
  if (loadingOverlay) {
    loadingOverlay.classList.add("is-hidden");
  }

  // Apply changes based on the new status
  switch (status) {
    case "loading":
      console.log("🔍 updateFeedbackUI: Setting loading state");
      if (findButton) {
        findButton.disabled = true;
        findButton.textContent = "Finding...";
      }
      controlButtons.forEach((btn) => (btn.disabled = true));
      if (loadingOverlay) {
        loadingOverlay.classList.remove("is-hidden");
      }
      break;

    case "success":
      console.log("🔍 updateFeedbackUI: Setting success state");
      if (__lastDataEmpty) {
        showToast("No data for selected range", "error");
      } else {
        showToast("Metrics loaded successfully!", "success");
      }
      // Ensure overlay is hidden and table stays hidden until Summary is explicitly opened
      try {
        const loadingOverlay2 = document.getElementById("loading-overlay");
        if (loadingOverlay2) loadingOverlay2.classList.add("is-hidden");
      } catch(_) {
        // Ignore overlay hide errors
      }
      try {
        if (typeof window !== 'undefined' && window.__hideTableUntilSummary) {
          const resultsContainer2 = document.querySelector('.results-display');
          if (resultsContainer2) resultsContainer2.classList.add('is-hidden');
        }
      } catch(_) {
        // Ignore table hide errors
      }
      break;

    case "error": {
      console.log("🔍 updateFeedbackUI: Setting error state");
      showToast("Failed to load metrics. Please check your connection or try again.", "error");

      const tableBody = document.getElementById("tableBody");
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="24">An error occurred.</td></tr>`;
      }
      break;
    }

    case "idle":
      console.log("🔍 updateFeedbackUI: Setting idle state");
      break;
      
    default:
      console.warn("⚠️ updateFeedbackUI: Unknown status:", status);
  }
  
  console.log("🔍 updateFeedbackUI: UI update completed for status:", status);
}
