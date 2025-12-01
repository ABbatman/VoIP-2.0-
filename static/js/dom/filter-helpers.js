// static/js/dom/filter-helpers.js
// Responsibility: Filter input value extraction and restoration
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { getDateManuallyCommittedAt } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DATE_IDS = {
  fromDate: 'fromDate',
  toDate: 'toDate',
  fromTime: 'fromTime',
  toTime: 'toTime'
};

const TEXT_IDS = {
  customer: 'customerInput',
  supplier: 'supplierInput',
  destination: 'destinationInput',
  customerGroup: 'customerGroupInput',
  supplierGroup: 'supplierGroupInput',
  destinationGroup: 'destinationGroupInput'
};

const URL_STATE_PREFIX = '#state=';
const RESTORE_DELAY_MS = 300;
const MANUAL_COMMIT_GUARD_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────

function getInputValue(id) {
  const el = document.getElementById(id);
  return el?.value?.trim() || '';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el || !value) return;
  el.value = value;
}

function getDateInputs() {
  return {
    fromDate: document.getElementById(DATE_IDS.fromDate),
    toDate: document.getElementById(DATE_IDS.toDate),
    fromTime: document.getElementById(DATE_IDS.fromTime),
    toTime: document.getElementById(DATE_IDS.toTime)
  };
}

function hasAllDateInputs(inputs) {
  return !!(inputs.fromDate && inputs.toDate && inputs.fromTime && inputs.toTime);
}

// ─────────────────────────────────────────────────────────────
// Flatpickr helpers
// ─────────────────────────────────────────────────────────────

function setDateWithFlatpickr(input, dateValue) {
  if (!input || !dateValue) return;

  input.value = dateValue;

  if (input._flatpickr) {
    input._flatpickr.setDate(dateValue, false);
    input.value = dateValue; // ensure sync
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function getDateFromFlatpickr(input) {
  if (!input?._flatpickr?.selectedDates?.[0]) return null;

  const d = input._flatpickr.selectedDates[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────
// URL state helpers
// ─────────────────────────────────────────────────────────────

function hasUrlState() {
  return window.location.hash?.startsWith(URL_STATE_PREFIX);
}

// ─────────────────────────────────────────────────────────────
// Build filter params
// ─────────────────────────────────────────────────────────────

export function buildFilterParams() {
  const fromDate = getInputValue(DATE_IDS.fromDate);
  const fromTime = getInputValue(DATE_IDS.fromTime);
  const toDate = getInputValue(DATE_IDS.toDate);
  const toTime = getInputValue(DATE_IDS.toTime);

  const normToTime = toTime === '00:00:00' ? '23:59:59' : toTime;

  return {
    customer: getInputValue(TEXT_IDS.customer),
    supplier: getInputValue(TEXT_IDS.supplier),
    destination: getInputValue(TEXT_IDS.destination),
    customerGroup: getInputValue(TEXT_IDS.customerGroup),
    supplierGroup: getInputValue(TEXT_IDS.supplierGroup),
    destinationGroup: getInputValue(TEXT_IDS.destinationGroup),
    from: `${fromDate} ${fromTime}`.trim(),
    to: `${toDate} ${normToTime}`.trim()
  };
}

// ─────────────────────────────────────────────────────────────
// Populate filters from state
// ─────────────────────────────────────────────────────────────

function isRecentManualCommit() {
  try {
    const committedAt = getDateManuallyCommittedAt();
    if (!committedAt) return false;

    const age = Date.now() - committedAt;
    return age >= 0 && age < MANUAL_COMMIT_GUARD_MS;
  } catch (e) {
    logError(ErrorCategory.FILTER, 'filterHelpers:isRecentManualCommit', e);
    return false;
  }
}

function extractFilterParams(state) {
  if (state?.filters) return state.filters;
  if (state?.from || state?.to || state?.customer || state?.supplier || state?.destination) {
    return state;
  }
  return null;
}

function areCurrentValuesMatching(inputs, params) {
  const currentFrom = `${inputs.fromDate?.value || ''} ${inputs.fromTime?.value || ''}`;
  const currentTo = `${inputs.toDate?.value || ''} ${inputs.toTime?.value || ''}`;
  return currentFrom === params.from && currentTo === params.to;
}

function hasFilledDateInputs(inputs) {
  return !!(
    inputs.fromDate?.value?.trim() &&
    inputs.toDate?.value?.trim() &&
    inputs.fromTime?.value?.trim() &&
    inputs.toTime?.value?.trim()
  );
}

function restoreTextFilters(params) {
  if (params.customer) setInputValue(TEXT_IDS.customer, params.customer);
  if (params.supplier) setInputValue(TEXT_IDS.supplier, params.supplier);
  if (params.destination) setInputValue(TEXT_IDS.destination, params.destination);
}

function restoreDateTimeFilter(dateInput, timeInput, dateTimeString) {
  if (!dateTimeString) return;

  const [dateVal, timeVal] = dateTimeString.split(' ');
  setDateWithFlatpickr(dateInput, dateVal);
  if (timeInput && timeVal) timeInput.value = timeVal;
}

function doPopulateFilters(params) {
  const inputs = getDateInputs();

  // skip if values already match
  if (hasFilledDateInputs(inputs) && areCurrentValuesMatching(inputs, params)) {
    return;
  }

  restoreTextFilters(params);
  restoreDateTimeFilter(inputs.fromDate, inputs.fromTime, params.from);
  restoreDateTimeFilter(inputs.toDate, inputs.toTime, params.to);
}

export function populateFiltersFromState(state) {
  try {
    if (isRecentManualCommit()) return;

    const params = extractFilterParams(state);
    if (!params) return;

    setTimeout(() => {
      try {
        doPopulateFilters(params);
      } catch (e) {
        logError(ErrorCategory.FILTER, 'filterHelpers:populateFiltersFromState', e);
      }
    }, RESTORE_DELAY_MS);
  } catch (e) {
    logError(ErrorCategory.FILTER, 'filterHelpers:populateFiltersFromState', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Default date range
// ─────────────────────────────────────────────────────────────

function hasAnyExistingValue(inputs) {
  return !!(
    inputs.fromDate?.value?.trim() ||
    inputs.toDate?.value?.trim() ||
    inputs.fromTime?.value?.trim() ||
    inputs.toTime?.value?.trim()
  );
}

function computeDefaultRange() {
  const now = new Date();
  const from = new Date(now.getTime() - DAY_MS);

  return {
    toDate: now.toISOString().slice(0, 10),
    toTime: now.toISOString().slice(11, 19),
    fromDate: from.toISOString().slice(0, 10),
    fromTime: from.toISOString().slice(11, 19)
  };
}

export function setDefaultDateRange() {
  const inputs = getDateInputs();
  if (!hasAllDateInputs(inputs)) return;

  if (hasUrlState()) return;
  if (hasAnyExistingValue(inputs)) return;

  const defaults = computeDefaultRange();

  setDateWithFlatpickr(inputs.fromDate, defaults.fromDate);
  setDateWithFlatpickr(inputs.toDate, defaults.toDate);

  if (!inputs.fromTime.value) inputs.fromTime.value = defaults.fromTime;
  if (!inputs.toTime.value) inputs.toTime.value = defaults.toTime;
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

export function validateFilterParams() {
  const inputs = getDateInputs();

  if (!hasAllDateInputs(inputs)) {
    const allIds = Object.values(DATE_IDS);
    return {
      isValid: false,
      missing: allIds.filter(id => !document.getElementById(id)),
      params: null
    };
  }

  const values = {
    fromDate: inputs.fromDate.value.trim(),
    toDate: inputs.toDate.value.trim(),
    fromTime: inputs.fromTime.value.trim(),
    toTime: inputs.toTime.value.trim()
  };

  const missing = Object.entries(values)
    .filter(([, val]) => !val)
    .map(([key]) => key);

  if (missing.length) {
    return { isValid: false, missing, params: null };
  }

  return {
    isValid: true,
    missing: [],
    params: {
      from: `${values.fromDate} ${values.fromTime}`,
      to: `${values.toDate} ${values.toTime}`
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Refresh
// ─────────────────────────────────────────────────────────────

export function refreshFilterValues() {
  const inputs = getDateInputs();
  if (!hasAllDateInputs(inputs)) return;

  const fromDateVal = getDateFromFlatpickr(inputs.fromDate);
  if (fromDateVal) inputs.fromDate.value = fromDateVal;

  const toDateVal = getDateFromFlatpickr(inputs.toDate);
  if (toDateVal) inputs.toDate.value = toDateVal;
}