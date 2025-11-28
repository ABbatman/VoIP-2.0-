// static/js/dom/ui-widgets.js
/* global flatpickr */
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { setDateManuallyCommittedAt } from '../state/runtimeFlags.js';

/**
 * Initializes the Flatpickr library for date inputs if it's available.
 */
export function initFlatpickr() {
  console.log(" initFlatpickr: start");
  try {
    if (typeof flatpickr !== "undefined") {
      const dateInputs = document.querySelectorAll(".date-part");
      dateInputs.forEach(input => {
        if (input && !input._flatpickr) {
          const fp = flatpickr(input, {
            altInput: false,
            altFormat: "F j, Y",
            dateFormat: "Y-m-d",
            allowInput: true,
          clickOpens: true,
          disableMobile: true, // force consistent desktop behavior
          // Accept visible (altFormat) and multiple manual formats
          parseDate: (dateStr, format) => {
            if (!dateStr) return undefined;
            const s = String(dateStr).trim();
            const tryFormats = [
              format || "Y-m-d",
              "F j, Y", // altFormat default
              "Y-m-d",
              "d.m.Y",
              "d-m-Y",
              "Y/m/d",
              "m/d/Y",
              "d/M/Y",
            ];
            for (const f of tryFormats) {
              try {
                const d = flatpickr.parseDate(s, f);
                if (d) return d;
              } catch (e) { logError(ErrorCategory.UI, 'uiWidgets', e); /* try next */ }
            }
            // compact numeric e.g. 20251002 -> Ymd
            const digits = s.replace(/[^0-9]/g, "");
            if (digits.length === 8) {
              const y = +digits.slice(0,4);
              const m = +digits.slice(4,6) - 1;
              const d = +digits.slice(6,8);
              const dt = new Date(Date.UTC(y, m, d));
              if (!isNaN(dt.getTime())) return dt;
            }
            // fallback to native Date
            const nd = new Date(s);
            return isNaN(nd.getTime()) ? undefined : nd;
          },
          appendTo: document.body, // render calendar in body to avoid clipping
          positionElement: input, // anchor to original input
          onReady: function(_, __, inst) {
            // ensure calendar is on top
            if (inst && inst.calendarContainer) {
              const cal = inst.calendarContainer;
              cal.style.zIndex = '9999';
            }
          },
          // Remove onClose re-sync to avoid possible re-entrancy
          onChange: function(selectedDates, dateStr) {
            // Avoid dispatching DOM events here to prevent loops
            console.log(`📅 Date changed: ${dateStr}`);
          }
        });
        
        // Store flatpickr instance on the input element
        input._flatpickr = fp;
        // Ensure calendar opens on click/focus of both original and alt input
        try {
          const openOnClick = () => { try { fp.open(); } catch (e) { logError(ErrorCategory.UI, 'uiWidgets', e); } };
          // Open only on click to avoid overriding manual typing on focus/blur
          input.addEventListener('click', openOnClick);
          if (fp.altInput) {
            fp.altInput.addEventListener('click', openOnClick);
          }
        } catch (e) { logError(ErrorCategory.UI, 'uiWidgets', e); /* best-effort */ }

        // Also allow manual typing in the original (hidden or visible) input in Y-m-d
        try {
          const commitOriginal = () => {
            const v = input.value.trim();
            if (!v) {
              fp.clear();
              setDateManuallyCommittedAt(Date.now());
              try { input.dataset.userCommittedTs = String(Date.now()); } catch (e) { logError(ErrorCategory.UI, 'uiWidgets', e);
                // Ignore dataset update errors
              }
              return { parsed: false, cleared: true };
            }
            fp.setDate(v, true, fp.config.dateFormat);
            const parsed = fp.selectedDates && fp.selectedDates.length > 0;
            if (parsed && fp.selectedDates[0]) {
              const dateObj = fp.selectedDates[0];
              const ymd = fp.formatDate(dateObj, fp.config.dateFormat);
              const altStr = fp.formatDate(dateObj, fp.config.altFormat);
              input.value = ymd;
              if (fp.altInput) fp.altInput.value = altStr;
              setDateManuallyCommittedAt(Date.now());
              try { input.dataset.userCommittedTs = String(Date.now()); } catch (e) { logError(ErrorCategory.UI, 'uiWidgets', e);
                // Ignore dataset update errors
              }
              return { parsed: true, cleared: false };
            }
            return { parsed: false, cleared: false };
          };
          // Do not listen to 'change' to avoid re-entrancy loops
          input.addEventListener('blur', (e) => {
            const res = commitOriginal();
            if (res && (res.parsed || res.cleared)) {
              // Prevent flatpickr internal blur from restoring previous value
              e.stopImmediatePropagation();
              e.preventDefault();
            }
          }, true);
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitOriginal();
              input.blur();
            }
          });
        } catch (e) { logError(ErrorCategory.UI, 'uiWidgets', e); /* best-effort */ }

        // altInput disabled: manual typing happens directly in the same input
        
        console.log(`✅ Flatpickr initialized for ${input.id}`);
      }
    });
    } else {
      console.warn("Flatpickr library not found. Custom date picker is disabled.");
    }
  } catch (e) {
    console.error("❌ initFlatpickr: exception during setup", e);
  }
}

/**
 * Initializes the custom popup controls for time inputs.
 * This creates the floating popup with N, Z, +, - buttons.
 */
export function initTimeControls() {
  const timeControlsPopup = document.getElementById("time-controls");
  if (!timeControlsPopup) {
    console.warn("Time controls popup not found");
    return;
  }

  // Check if time controls are already initialized
  if (timeControlsPopup.dataset.initialized === 'true') {
    return;
  }

  // Mark as initialized
  timeControlsPopup.dataset.initialized = 'true';

  // Make the popup focusable (important for blur/focus logic)
  timeControlsPopup.tabIndex = -1;

  // Get both time input fields
  const timeInputs = [
    document.getElementById("fromTime"),
    document.getElementById("toTime"),
  ];
  
  let activeTimeInput = null;

  // Show the time controls popup under the input (stick to viewport)
  const showTimeControls = (inputElement) => {
    activeTimeInput = inputElement;
    console.log(`🎯 Time controls activated for:`, inputElement.id, inputElement);
    console.log(`🎯 Active time input set to:`, activeTimeInput);
    console.log(`🎯 Active time input id:`, activeTimeInput?.id);
    
    const positionPopup = () => {
      const r = inputElement.getBoundingClientRect();
      timeControlsPopup.style.position = 'fixed';
      timeControlsPopup.style.top = `${r.bottom + 5}px`;
      timeControlsPopup.style.left = `${r.left}px`;
      timeControlsPopup.style.zIndex = '10000';
    };

    timeControlsPopup.style.display = "flex";
    positionPopup();
    // Track scroll/resize to keep it anchored
    timeControlsPopup._scrollHandler = () => positionPopup();
    timeControlsPopup._resizeHandler = () => positionPopup();
    window.addEventListener('scroll', timeControlsPopup._scrollHandler, true);
    window.addEventListener('resize', timeControlsPopup._resizeHandler);
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
        // Cleanup listeners
        if (timeControlsPopup._scrollHandler) window.removeEventListener('scroll', timeControlsPopup._scrollHandler, true);
        if (timeControlsPopup._resizeHandler) window.removeEventListener('resize', timeControlsPopup._resizeHandler);
        timeControlsPopup._scrollHandler = null;
        timeControlsPopup._resizeHandler = null;
      }
    }, 100);
  };

  // Add focus and blur listeners to each time input
  timeInputs.forEach((input) => {
    if (input) {
      input.addEventListener("focus", () => showTimeControls(input));
      input.addEventListener("blur", hideTimeControls);
      // Remove the change event listener that was causing infinite loop
    }
  });

  // Add blur event to popup itself to hide when focus lost
  timeControlsPopup.addEventListener("blur", hideTimeControls, true);

  // Helpers for local datetime parsing/formatting
  const pad2 = (n) => String(n).padStart(2, '0');
  const parseYmd = (s) => {
    const [y, m, d] = (s || '').split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return { y, m, d };
  };
  const parseHms = (s) => {
    const [hh, mm, ss] = (s || '').split(':').map((x) => parseInt(x, 10));
    return { hh: hh || 0, mm: mm || 0, ss: ss || 0 };
  };
  const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const toHms = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

  // MAIN: Handle clicks on popup buttons (single-fire, no debounce)
  let _timeClickInProgress = false;
  timeControlsPopup.addEventListener("click", (event) => {
    const actionEl = event.target.closest('[data-action]');
    const action = actionEl && actionEl.dataset ? actionEl.dataset.action : undefined;
    if (_timeClickInProgress) return;
    _timeClickInProgress = true;
    if (!action || !activeTimeInput) return;
    event.stopImmediatePropagation();
    event.preventDefault();

    // Determine which date input to use (fromDate or toDate)
    const isFrom = activeTimeInput.id === "fromTime";
    const dateInput = document.getElementById(isFrom ? "fromDate" : "toDate");
    if (!dateInput) return;

    if (action === "zero") {
      // Set time to 00:00:00
      activeTimeInput.value = "00:00:00";
      console.log(`⏰ Set ${isFrom ? 'from' : 'to'} time to 00:00:00`);
    } else if (action === "now") {
      // Set current date and time (LOCAL)
      const now = new Date();
      const currentDate = toYmd(now);
      const currentTime = toHms(now);
      
      console.log(`⏰ Setting ${isFrom ? 'from' : 'to'} to current time: ${currentDate} ${currentTime}`);
      console.log(`🔍 Active time input before update:`, activeTimeInput);
      console.log(`🔍 Active time input value before update:`, activeTimeInput.value);
      
      // Update date input
      if (dateInput._flatpickr) { dateInput._flatpickr.setDate(currentDate, false); }
      dateInput.value = currentDate;
      
      // Update time input
      activeTimeInput.value = currentTime;
      console.log(`⏰ Time input value after update:`, activeTimeInput.value);
      
      // No programmatic events to avoid external loops
      
      console.log(`✅ ${isFrom ? 'From' : 'To'} date/time set to: ${currentDate} ${currentTime}`);
    } else {
      // Parse LOCAL datetime from inputs and adjust by exactly 1 hour
      const ymdObj = parseYmd(dateInput.value);
      const hmsObj = parseHms(activeTimeInput.value || "00:00:00");
      if (!ymdObj) {
        console.error("Invalid date value.");
        return;
      }
      const current = new Date(ymdObj.y, ymdObj.m - 1, ymdObj.d, hmsObj.hh, hmsObj.mm, hmsObj.ss);
      if (action === "hour-plus") {
        current.setHours(current.getHours() + 1);
      } else if (action === "hour-minus") {
        current.setHours(current.getHours() - 1);
      }
      const newDate = toYmd(current);
      const newTime = toHms(current);
      
      console.log(`⏰ Adjusting ${isFrom ? 'from' : 'to'} time: ${newDate} ${newTime}`);
      
      // Update date input
      if (dateInput._flatpickr) {
        dateInput._flatpickr.setDate(newDate, false);
        // Also update the regular input value to keep them in sync
        dateInput.value = newDate;
      } else {
        dateInput.value = newDate;
      }
      
      // Update time input
      activeTimeInput.value = newTime;
      console.log(`✅ ${isFrom ? 'From' : 'To'} date/time adjusted to: ${newDate} ${newTime}`);
      // Don't trigger change event to avoid infinite loop
    }
    // Return focus to the active input so popup stays visible
    activeTimeInput.focus();
    // Release reentrancy guard on next tick
    setTimeout(() => { _timeClickInProgress = false; }, 0);
  });
}

