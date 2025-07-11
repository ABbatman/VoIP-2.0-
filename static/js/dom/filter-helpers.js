// static/js/dom/filter-helpers.js
// This module contains helper functions specifically for the filter logic.

/**
 * Builds a parameters object from the filter input fields.
 * @returns {Object} The filter parameters for the API call.
 */
export function buildFilterParams() {
  const get = (id) => document.getElementById(id)?.value.trim() || "";

  return {
    customer: get("customerInput"),
    supplier: get("supplierInput"),
    destination: get("destinationInput"),
    from: (get("fromDate") + " " + get("fromTime")).trim(),
    to: (get("toDate") + " " + get("toTime")).trim(),
  };
}

/**
 * Populates the filter input fields from a given parameters object.
 * This is used when loading state from the URL.
 * @param {Object} params - The filter parameters object.
 */
export function populateFiltersFromState(params) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Check for flatpickr instance for date inputs
    if (el.classList.contains("date-part") && el._flatpickr) {
      // Set date without triggering change events
      el._flatpickr.setDate(value, false);
    } else {
      el.value = value || "";
    }
  };

  set("customerInput", params.customer);
  set("supplierInput", params.supplier);
  set("destinationInput", params.destination);

  // Split date and time from 'from' and 'to' strings
  const [fromDate, fromTime] = params.from ? params.from.split(" ") : ["", ""];
  const [toDate, toTime] = params.to ? params.to.split(" ") : ["", ""];

  set("fromDate", fromDate);
  set("fromTime", fromTime);
  set("toDate", toDate);
  set("toTime", toTime);

  console.log("✅ Filter inputs populated from loaded state.");
}

/**
 * Sets the default date range in the date/time inputs (last 24 hours).
 */
export function setDefaultDateRange() {
  const now = new Date();
  const toDateTimeString = now.toISOString();
  const toDate = toDateTimeString.slice(0, 10);
  const toTime = toDateTimeString.slice(11, 19);

  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDateTimeString = from.toISOString();
  const fromDate = fromDateTimeString.slice(0, 10);
  const fromTime = fromDateTimeString.slice(11, 19);

  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");

  if (fromDateInput) {
    if (fromDateInput._flatpickr)
      fromDateInput._flatpickr.setDate(fromDate, true);
    else fromDateInput.value = fromDate;
  }
  if (toDateInput) {
    if (toDateInput._flatpickr) toDateInput._flatpickr.setDate(toDate, true);
    else toDateInput.value = toDate;
  }

  const fromTimeInput = document.getElementById("fromTime");
  if (fromTimeInput) fromTimeInput.value = fromTime;
  const toTimeInput = document.getElementById("toTime");
  if (toTimeInput) toTimeInput.value = toTime;

  console.log("🔄 Default date range applied.");
}
