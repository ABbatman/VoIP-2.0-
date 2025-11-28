// static/js/dom/filter-helpers.js
// This module contains helper functions specifically for the filter logic.
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { getDateManuallyCommittedAt } from '../state/runtimeFlags.js';

/**
 * Builds a parameters object from the filter input fields.
 * @returns {Object} The filter parameters for the API call.
 */
export function buildFilterParams() {
  const get = (id) => {
    const element = document.getElementById(id);
    if (!element) {
      console.warn(`⚠️ buildFilterParams: Element with id "${id}" not found`);
      return "";
    }
    
    // Handle flatpickr date inputs: ALWAYS trust input.value
    if (element.classList.contains("date-part")) {
      const value = element.value.trim() || "";
      console.log(`📅 buildFilterParams: ${id} input.value (single source):`, value);
      return value;
    }
    
    const value = element.value.trim() || "";
    console.log(`📝 buildFilterParams: ${id} direct input value:`, value);
    return value;
  };

  console.log("🔍 buildFilterParams: Starting to build filter parameters...");
  
  const fromDate = get("fromDate");
  const fromTime = get("fromTime");
  const toDate = get("toDate");
  const toTime = get("toTime");

  console.log("🔍 buildFilterParams: Extracted values:", {
    fromDate, fromTime, toDate, toTime
  });

  // Validate that we have both date and time
  if (!fromDate || !fromTime || !toDate || !toTime) {
    console.warn("⚠️ Filter Helpers: Missing date or time values", {
      fromDate, fromTime, toDate, toTime
    });
  }

  const normToTime = (toTime === "00:00:00") ? "23:59:59" : toTime;
  const params = {
    customer: get("customerInput"),
    supplier: get("supplierInput"),
    destination: get("destinationInput"),
    customerGroup: get("customerGroupInput"),
    supplierGroup: get("supplierGroupInput"),
    destinationGroup: get("destinationGroupInput"),
    from: `${fromDate} ${fromTime}`.trim(),
    to: `${toDate} ${normToTime}`.trim(),
  };

  console.log("🔍 buildFilterParams: Final result:", params);
  return params;
}

/**
 * Populates the filter input fields from a given parameters object.
 * This is used when loading state from the URL.
 * @param {Object} state - The filter parameters object or state object with filters.
 */
export function populateFiltersFromState(state) {
  try {
    // Do not overwrite if user has just manually committed a date
    try {
      const committedAt = getDateManuallyCommittedAt();
      if (committedAt) {
        const age = Date.now() - committedAt;
        if (age >= 0 && age < 5000) {
          console.log("⏳ populateFiltersFromState: Skipping due to recent manual commit");
          return;
        }
      }
    } catch (e) { logError(ErrorCategory.FILTER, 'filterHelpers', e);
      // Ignore guard check errors
    }

    // Add call stack logging to understand why this is called multiple times
    console.log("🔍 populateFiltersFromState: Called with stack:", new Error().stack);
    
    let filterParams = null;
    
    // Handle both formats: direct filterParams or state.filters
    if (state && state.filters) {
      filterParams = state.filters;
      console.log("🔍 populateFiltersFromState: Using state.filters format");
    } else if (state && (state.from || state.to || state.customer || state.supplier || state.destination)) {
      filterParams = state;
      console.log("🔍 populateFiltersFromState: Using direct filterParams format");
    } else {
      console.warn("⚠️ populateFiltersFromState: Invalid state format:", state);
      return;
    }
    
    console.log("🔍 populateFiltersFromState called with:", filterParams);
    console.log("🔍 populateFiltersFromState: DOM elements check:", {
      fromDate: !!document.getElementById("fromDate"),
      toDate: !!document.getElementById("toDate"),
      fromTime: !!document.getElementById("fromTime"),
      toTime: !!document.getElementById("toTime")
    });
    
    // Longer delay to ensure flatpickr is fully initialized
    setTimeout(() => {
      try {
        console.log("🔍 populateFiltersFromState: Executing after delay...");
        _populateFilters(filterParams);
      } catch (error) {
        console.error("❌ populateFiltersFromState: Error in delayed execution:", error);
      }
    }, 300);
  } catch (error) {
    console.error("❌ populateFiltersFromState: Error in main function:", error);
  }
}

function _populateFilters(filterParams) {
  console.log("🔍 _populateFilters: Starting filter restoration...");
  
  // Check if filters are already populated to avoid overwriting
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");
  const fromTimeInput = document.getElementById("fromTime");
  const toTimeInput = document.getElementById("toTime");
  
  console.log("🔍 _populateFilters: DOM elements found:", {
    fromDate: !!fromDateInput,
    toDate: !!toDateInput,
    fromTime: !!fromTimeInput,
    toTime: !!toTimeInput
  });
  
  // Check if filters have meaningful values (not just empty strings)
  const hasMeaningfulValues = fromDateInput?.value && fromDateInput.value.trim() !== "" &&
                             toDateInput?.value && toDateInput.value.trim() !== "" &&
                             fromTimeInput?.value && fromTimeInput.value.trim() !== "" &&
                             toTimeInput?.value && toTimeInput.value.trim() !== "";
  
  console.log("🔍 _populateFilters: Has meaningful values check:", {
    fromDateValue: fromDateInput?.value,
    toDateValue: toDateInput?.value,
    fromTimeValue: fromTimeInput?.value,
    toTimeValue: toTimeInput?.value,
    hasMeaningfulValues
  });
  
  // Only skip if we have meaningful values AND they match what we're trying to restore
  if (hasMeaningfulValues) {
    const currentFrom = `${fromDateInput.value} ${fromTimeInput.value}`;
    const currentTo = `${toDateInput.value} ${toTimeInput.value}`;
    
    const valuesMatch = currentFrom === filterParams.from && currentTo === filterParams.to;
    
    console.log("🔍 _populateFilters: Values match check:", {
      currentFrom,
      currentTo,
      filterParamsFrom: filterParams.from,
      filterParamsTo: filterParams.to,
      valuesMatch
    });
    
    if (valuesMatch) {
      console.log("🔍 _populateFilters: Values already match, skipping restoration");
      return;
    } else {
      console.log("🔍 _populateFilters: Values don't match, proceeding with restoration");
    }
  } else {
    console.log("🔍 _populateFilters: No meaningful values, proceeding with restoration");
  }
  
  console.log("🔍 _populateFilters: Proceeding with filter restoration");
  
  // Populate text inputs
  if (filterParams.customer) {
    const customerInput = document.getElementById("customerInput");
    if (customerInput) {
      customerInput.value = filterParams.customer;
      console.log(`📝 _populateFilters: customer set to:`, filterParams.customer);
    }
  }
  
  if (filterParams.supplier) {
    const supplierInput = document.getElementById("supplierInput");
    if (supplierInput) {
      supplierInput.value = filterParams.supplier;
      console.log(`📝 _populateFilters: supplier set to:`, filterParams.supplier);
    }
  }
  
  if (filterParams.destination) {
    const destinationInput = document.getElementById("destinationInput");
    if (destinationInput) {
      destinationInput.value = filterParams.destination;
      console.log(`📝 _populateFilters: destination set to:`, filterParams.destination);
    }
  }
  
  // Populate date inputs
  if (filterParams.from) {
    console.log(`📅 _populateFilters: Processing 'from' value:`, filterParams.from);
    const [fromDate, fromTime] = filterParams.from.split(" ");
    console.log(`📅 _populateFilters: Split fromDate:`, fromDate, "fromTime:", fromTime);
    
    if (fromDateInput) {
      console.log(`📅 _populateFilters: fromDateInput found, has flatpickr:`, !!fromDateInput._flatpickr);
      
      // Always set the input value first
      fromDateInput.value = fromDate;
      console.log(`📅 _populateFilters: fromDate input value set to:`, fromDateInput.value);
      
      if (fromDateInput._flatpickr) {
        // Then sync with flatpickr
        fromDateInput._flatpickr.setDate(fromDate, false);
        // Force sync with input value again to ensure consistency
        fromDateInput.value = fromDate;
        // Trigger change event to ensure flatpickr updates
        fromDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`📅 _populateFilters: fromDate set via flatpickr:`, fromDate);
      } else {
        console.log(`📅 _populateFilters: fromDate set directly:`, fromDate);
      }
    } else {
      console.warn("⚠️ _populateFilters: fromDateInput not found");
    }
    
    if (fromTimeInput && fromTime) {
      fromTimeInput.value = fromTime;
      console.log(`⏰ _populateFilters: fromTime set to:`, fromTimeInput.value);
    } else if (!fromTimeInput) {
      console.warn("⚠️ _populateFilters: fromTimeInput not found");
    }
  }
  
  if (filterParams.to) {
    console.log(`📅 _populateFilters: Processing 'to' value:`, filterParams.to);
    const [toDate, toTime] = filterParams.to.split(" ");
    console.log(`📅 _populateFilters: Split toDate:`, toDate, "toTime:", toTime);
    
    if (toDateInput) {
      console.log(`📅 _populateFilters: toDateInput found, has flatpickr:`, !!toDateInput._flatpickr);
      
      // Always set the input value first
      toDateInput.value = toDate;
      console.log(`📅 _populateFilters: toDate input value set to:`, toDateInput.value);
      
      if (toDateInput._flatpickr) {
        // Then sync with flatpickr
        toDateInput._flatpickr.setDate(toDate, false);
        // Force sync with input value again to ensure consistency
        toDateInput.value = toDate;
        // Trigger change event to ensure flatpickr updates
        toDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`📅 _populateFilters: toDate set via flatpickr:`, toDate);
      } else {
        console.log(`📅 _populateFilters: toDate set directly:`, toDate);
      }
    } else {
      console.warn("⚠️ _populateFilters: toDateInput not found");
    }
    
    if (toTimeInput && toTime) {
      toTimeInput.value = toTime;
      console.log(`⏰ _populateFilters: toTime set to:`, toTimeInput.value);
    } else if (!toTimeInput) {
      console.warn("⚠️ _populateFilters: toTimeInput not found");
    }
  }
  
  // Final verification that values were set correctly
  console.log("🔍 _populateFilters: Final verification:", {
    fromDate: fromDateInput?.value,
    toDate: toDateInput?.value,
    fromTime: fromTimeInput?.value,
    toTime: toTimeInput?.value
  });
}

/**
 * Sets the default date range in the date/time inputs (last 24 hours).
 */
export function setDefaultDateRange() {
  const fromDate = document.getElementById("fromDate");
  const toDate = document.getElementById("toDate");
  const fromTime = document.getElementById("fromTime");
  const toTime = document.getElementById("toTime");

  if (!fromDate || !toDate || !fromTime || !toTime) {
    console.warn("⚠️ Filter Helpers: Date/time inputs not found");
    return;
  }

  // Check if there's URL state - if yes, don't set default dates
  const hasUrlState = window.location.hash && window.location.hash.startsWith("#state=");
  if (hasUrlState) {
    console.log("🔍 setDefaultDateRange: URL state exists, skipping default date range");
    return;
  }

  // Check if values are already set - don't overwrite existing values
  const hasExistingValues = (fromDate.value && fromDate.value.trim() !== "") ||
                           (toDate.value && toDate.value.trim() !== "") ||
                           (fromTime.value && fromTime.value.trim() !== "") ||
                           (toTime.value && toTime.value.trim() !== "");
  
  if (hasExistingValues) {
    console.log("🔍 setDefaultDateRange: Values already exist, skipping default date range");
    return;
  }

  // Set default date range (last 24 hours) in UTC (GMT0)
  const now = new Date();
  const toDateValue = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const toTimeValue = now.toISOString().slice(11, 19); // HH:MM:SS (UTC)

  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDateValue = from.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const fromTimeValue = from.toISOString().slice(11, 19); // HH:MM:SS (UTC)

  console.log("🔍 setDefaultDateRange: Setting default dates:", {
    now: now.toString(),
    from: from.toString(),
    fromDateValue,
    fromTimeValue,
    toDateValue,
    toTimeValue
  });

  // Set values using flatpickr if available, otherwise direct assignment
  if (fromDate._flatpickr) {
    fromDate._flatpickr.setDate(fromDateValue, false);
  } else {
    fromDate.value = fromDateValue;
  }
  
  if (toDate._flatpickr) {
    toDate._flatpickr.setDate(toDateValue, false);
  } else {
    toDate.value = toDateValue;
  }
  
  // Only set time if the field is empty
  if (!fromTime.value) {
    fromTime.value = fromTimeValue;
  }
  
  if (!toTime.value) {
    toTime.value = toTimeValue;
  }
  
  console.log("🔍 setDefaultDateRange: Default dates set successfully");
}

/**
 * Validates that all required filter parameters are set
 * @returns {Object} Validation result with isValid flag and missing fields
 */
export function validateFilterParams() {
  console.log("🔍 validateFilterParams: Starting validation...");
  
  const fromDate = document.getElementById("fromDate");
  const toDate = document.getElementById("toDate");
  const fromTime = document.getElementById("fromTime");
  const toTime = document.getElementById("toTime");

  console.log("🔍 validateFilterParams: DOM elements found:", {
    fromDate: !!fromDate,
    toDate: !!toDate,
    fromTime: !!fromTime,
    toTime: !!toTime
  });

  if (!fromDate || !toDate || !fromTime || !toTime) {
    console.warn("⚠️ validateFilterParams: Missing DOM elements");
    return {
      isValid: false,
      missing: ["fromDate", "toDate", "fromTime", "toTime"].filter(id => !document.getElementById(id))
    };
  }

  // Get date values: ALWAYS from input.value
  const fromDateValue = fromDate.value.trim();
  const toDateValue = toDate.value.trim();
  console.log("🔍 validateFilterParams: dates from input values:", { fromDateValue, toDateValue });

  const fromTimeValue = fromTime.value.trim();
  const toTimeValue = toTime.value.trim();

  console.log("🔍 validateFilterParams: All values:", {
    fromDateValue,
    fromTimeValue,
    toDateValue,
    toTimeValue
  });

  const missing = [];
  
  if (!fromDateValue) missing.push("fromDate");
  if (!toDateValue) missing.push("toDate");
  if (!fromTimeValue) missing.push("fromTime");
  if (!toTimeValue) missing.push("toTime");

  if (missing.length > 0) {
    console.warn("⚠️ validateFilterParams: Missing values:", missing);
    console.warn("⚠️ validateFilterParams: Raw input values:", {
      fromDateRaw: fromDate.value,
      toDateRaw: toDate.value,
      fromTimeRaw: fromTime.value,
      toTimeRaw: toTime.value
    });
    return {
      isValid: false,
      missing,
      params: null
    };
  }

  // Build params object
  const params = {
    from: `${fromDateValue} ${fromTimeValue}`,
    to: `${toDateValue} ${toTimeValue}`
  };

  console.log("🔍 validateFilterParams: Validation successful, params:", params);
  return {
    isValid: true,
    missing: [],
    params
  };
}

/**
 * Force refresh of filter values (useful after programmatic changes)
 */
export function refreshFilterValues() {
  const fromDate = document.getElementById("fromDate");
  const toDate = document.getElementById("toDate");
  const fromTime = document.getElementById("fromTime");
  const toTime = document.getElementById("toTime");

  if (!fromDate || !toDate || !fromTime || !toTime) {
    console.warn("⚠️ Filter Helpers: Date/time inputs not found for refresh");
    return;
  }

  // Refresh date values from flatpickr instances if available
  if (fromDate._flatpickr && fromDate._flatpickr.selectedDates[0]) {
    const date = fromDate._flatpickr.selectedDates[0];
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    fromDate.value = `${year}-${month}-${day}`;
  }
  
  if (toDate._flatpickr && toDate._flatpickr.selectedDates[0]) {
    const date = toDate._flatpickr.selectedDates[0];
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    toDate.value = `${year}-${month}-${day}`;
  }
}