// static/js/dom/ui-widgets.js
// This module contains initialization logic for self-contained UI components like date pickers.

/**
 * Initializes the Flatpickr library for date inputs if it's available.
 */
export function initFlatpickr() {
  if (typeof flatpickr !== "undefined") {
    flatpickr(".date-part", {
      altInput: true,
      altFormat: "F j, Y",
      dateFormat: "Y-m-d",
    });
    console.log("✅ Flatpickr initialized.");
  } else {
    console.warn(
      "Flatpickr library not found. Custom date picker is disabled."
    );
  }
}

/**
 * Initializes the custom popup controls for time inputs.
 */
export function initTimeControls() {
  const timeControlsPopup = document.getElementById("time-controls");
  if (!timeControlsPopup) return;

  // Make the popup focusable (important for blur/focus logic)
  timeControlsPopup.tabIndex = -1;

  // Get both time input fields
  const timeInputs = [
    document.getElementById("fromTime"),
    document.getElementById("toTime"),
  ];
  let activeTimeInput = null;

  // Show the time controls popup under the input
  const showTimeControls = (inputElement) => {
    activeTimeInput = inputElement;
    const inputRect = inputElement.getBoundingClientRect();
    timeControlsPopup.style.display = "flex";
    timeControlsPopup.style.top = `${inputRect.bottom + window.scrollY + 5}px`;
    timeControlsPopup.style.left = `${inputRect.left + window.scrollX}px`;
  };

  // Hide the popup only when focus is lost from both input and popup
  const hideTimeControls = () => {
    setTimeout(() => {
      // Check if popup or any of the time inputs have focus
      const popupHasFocus = timeControlsPopup.contains(document.activeElement);
      const inputHasFocus = timeInputs.some(
        (input) => input === document.activeElement
      );
      if (!popupHasFocus && !inputHasFocus) {
        timeControlsPopup.style.display = "none";
        activeTimeInput = null;
      }
    }, 100);
  };

  // Add focus and blur listeners to each time input
  timeInputs.forEach((input) => {
    if (input) {
      input.addEventListener("focus", () => showTimeControls(input));
      input.addEventListener("blur", hideTimeControls);
    }
  });

  // Add blur event to popup itself to hide when focus lost
  timeControlsPopup.addEventListener("blur", hideTimeControls, true);

  // MAIN: Handle clicks on popup buttons
  timeControlsPopup.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action || !activeTimeInput) return;

    // Determine which date input to use (fromDate or toDate)
    const isFrom = activeTimeInput.id === "fromTime";
    const dateInput = document.getElementById(isFrom ? "fromDate" : "toDate");
    if (!dateInput) return;

    if (action === "zero") {
      // Set time to 00:00:00
      activeTimeInput.value = "00:00:00";
    } else if (action === "now") {
      // Set current date and time (UTC)
      const now = new Date();
      const nowUTCString = now.toISOString();
      if (dateInput._flatpickr) {
        dateInput._flatpickr.setDate(nowUTCString.slice(0, 10), true);
      } else {
        dateInput.value = nowUTCString.slice(0, 10);
      }
      activeTimeInput.value = nowUTCString.slice(11, 19);
    } else {
      // Parse the current datetime from the date and time input values
      let currentDateTime = new Date(
        `${dateInput.value}T${activeTimeInput.value || "00:00:00"}Z`
      );
      if (isNaN(currentDateTime.getTime())) {
        currentDateTime = new Date(`${dateInput.value}T00:00:00Z`);
        if (isNaN(currentDateTime.getTime())) {
          console.error("Invalid date or time value.");
          return;
        }
      }
      // Adjust hours
      if (action === "hour-plus") {
        currentDateTime.setTime(currentDateTime.getTime() + 3600 * 1000);
      } else if (action === "hour-minus") {
        currentDateTime.setTime(currentDateTime.getTime() - 3600 * 1000);
      }
      const newUTCString = currentDateTime.toISOString();
      if (dateInput._flatpickr) {
        dateInput._flatpickr.setDate(newUTCString.slice(0, 10), true);
      } else {
        dateInput.value = newUTCString.slice(0, 10);
      }
      activeTimeInput.value = newUTCString.slice(11, 19);
    }
    // Return focus to the active input so popup stays visible
    activeTimeInput.focus();
  });
}
