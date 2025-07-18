// static/js/dom/hideYColumns.js
// This module handles the logic for toggling the visibility of "Yesterday" columns.

import { subscribe } from "../state/eventBus.js";
import { toggleYColumnsVisible } from "../state/tableState.js";
// --- NEW: Import the unified update function from its dedicated module ---
import { updateTopScrollbar } from "./top-scrollbar.js";

/**
 * Initializes the event listener for the Y-column toggle button.
 */
export function initYColumnToggle() {
  const table = document.querySelector(".results-display__table");
  if (!table) return;

  table.addEventListener("click", (event) => {
    const toggleButton = event.target.closest(".y-column-toggle-btn");
    if (!toggleButton) {
      return;
    }
    toggleYColumnsVisible();
  });

  subscribe("tableState:yVisibilityChanged", (isVisible) => {
    const tableEl = document.querySelector(".results-display__table");
    const button = document.querySelector(".y-column-toggle-btn");

    if (tableEl) {
      if (isVisible) {
        tableEl.classList.remove("y-columns-hidden");
      } else {
        tableEl.classList.add("y-columns-hidden");
      }
    }

    if (button) {
      button.innerHTML = getYColumnToggleIcon(isVisible);
    }

    // --- NEW: Call the scrollbar update function after the CSS class has changed ---
    setTimeout(updateTopScrollbar, 50); // Delay to allow browser repaint
  });

  console.log("✅ Y-Column toggle initialized.");
}

/**
 * A helper function to get the correct icon based on visibility state.
 */
export function getYColumnToggleIcon(isVisible) {
  const iconVisible = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>`;
  const iconHidden = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588zM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089z"/><path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12-.708.708z"/></svg>`;
  return isVisible ? iconVisible : iconHidden;
}
