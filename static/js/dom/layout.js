// static/js/dom/layout.js

import { subscribe } from "../state/eventBus.js";

/**
 * Initializes listeners that update layout elements based on app state changes.
 */
export function initLayoutSync() {
  // The subscriber will handle changes that happen *after* initial load.
  subscribe("appState:reverseModeChanged", (isReversed) => {
    console.log(
      "[Event] appState:reverseModeChanged triggered layout updates."
    );
    updateReverseButtonState(isReversed);
  });
  console.log("🔄 Layout synchronization initialized.");
}

/**
 * Updates the visual state (CSS class) of the reverse button.
 * This is exported to be used on initial load.
 * @param {boolean} isReversed - The current reverse mode state.
 */
export function updateReverseButtonState(isReversed) {
  const reverseButton = document.getElementById("btnReverse");
  if (reverseButton) {
    if (isReversed) {
      reverseButton.classList.add("active");
    } else {
      reverseButton.classList.remove("active");
    }
  }
}
