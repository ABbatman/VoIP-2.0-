// static/js/dom/ui-feedback.js
// Responsibility: Visual feedback (toasts, loading state)
import { subscribe } from '../state/eventBus.js';
import { isSummaryFetchInProgress, shouldHideTableUntilSummary } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const IDS = {
  toastContainer: 'toast-container',
  findButton: 'findButton',
  summaryButton: 'btnSummary',
  loadingOverlay: 'loading-overlay',
  tableBody: 'tableBody'
};

const HIDDEN_CLASS = 'is-hidden';
const TOAST_SHOW_DELAY = 100;
const TOAST_DURATION = 3000;

const MESSAGES = {
  noData: 'No data for selected range',
  success: 'Metrics loaded successfully!',
  error: 'Failed to load metrics. Please check your connection or try again.'
};

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let lastDataEmpty = false;

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  const container = document.getElementById(IDS.toastContainer);
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), TOAST_SHOW_DELAY);

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, TOAST_DURATION);
}

// ─────────────────────────────────────────────────────────────
// UI update helpers
// ─────────────────────────────────────────────────────────────

function getElement(id) {
  return document.getElementById(id);
}

function setButtonsEnabled(enabled) {
  document.querySelectorAll('.btn').forEach(btn => { btn.disabled = !enabled; });
}

function resetDefaultState() {
  const findBtn = getElement(IDS.findButton);
  if (findBtn) {
    findBtn.disabled = false;
    findBtn.textContent = 'Find';
  }

  setButtonsEnabled(true);

  const summaryBtn = getElement(IDS.summaryButton);
  if (summaryBtn) summaryBtn.disabled = false;

  const overlay = getElement(IDS.loadingOverlay);
  if (overlay) overlay.classList.add(HIDDEN_CLASS);
}

function handleLoading(isSummaryFetch) {
  if (!isSummaryFetch) {
    const findBtn = getElement(IDS.findButton);
    if (findBtn) {
      findBtn.disabled = true;
      findBtn.textContent = 'Finding...';
    }
    setButtonsEnabled(false);
    const overlay = getElement(IDS.loadingOverlay);
    if (overlay) overlay.classList.remove(HIDDEN_CLASS);
  } else {
    const summaryBtn = getElement(IDS.summaryButton);
    if (summaryBtn) summaryBtn.disabled = true;
  }
}

function handleSuccess(isSummaryFetch) {
  if (!isSummaryFetch) {
    showToast(lastDataEmpty ? MESSAGES.noData : MESSAGES.success, lastDataEmpty ? 'error' : 'success');
    const overlay = getElement(IDS.loadingOverlay);
    if (overlay) overlay.classList.add(HIDDEN_CLASS);

    // only manage table visibility for non-summary fetches
    const results = document.querySelector('.results-display');
    if (shouldHideTableUntilSummary()) {
      if (results) results.classList.add(HIDDEN_CLASS);
    } else {
      if (results) results.classList.remove(HIDDEN_CLASS);
    }
  }
  // for summary fetch, renderSummaryTable manages table visibility
}

function handleError() {
  showToast(MESSAGES.error, 'error');

  const tbody = getElement(IDS.tableBody);
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="24">An error occurred.</td></tr>';
  }
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

function updateFeedbackUI(status) {
  const isSummaryFetch = isSummaryFetchInProgress();

  resetDefaultState();

  switch (status) {
    case 'loading':
      handleLoading(isSummaryFetch);
      break;
    case 'success':
      handleSuccess(isSummaryFetch);
      break;
    case 'error':
      handleError();
      break;
    case 'idle':
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initUiFeedback() {
  subscribe('appState:statusChanged', updateFeedbackUI);

  subscribe('appState:dataChanged', data => {
    const hasData = !!(data?.main_rows?.length || data?.peer_rows?.length || data?.hourly_rows?.length);
    lastDataEmpty = !hasData;
  });
}
