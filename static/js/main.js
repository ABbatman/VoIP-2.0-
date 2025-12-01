// static/js/main.js
// Responsibility: Vite entry - CSS imports and dashboard bootstrap

// ─────────────────────────────────────────────────────────────
// CSS imports
// ─────────────────────────────────────────────────────────────

import '/css/tokens.css';
import '/css/components.css';
import '/css/filters-panel.css';
import '/css/results-display.css';
import '/css/table-header.css';
import '/css/layout.css';
import '/css/top-scrollbar.css';
import '/css/hideYColumns.css';
import '/css/feedback.css';
import '/css/virtual.css';
import '/css/renderer.css';
import '/css/unified-style.css';
import 'flatpickr/dist/flatpickr.min.css';

// ─────────────────────────────────────────────────────────────
// Module imports
// ─────────────────────────────────────────────────────────────

import flatpickr from 'flatpickr';
import morphdom from 'morphdom';

import './state/runtimeFlags.js';
import './state/moduleRegistry.js';
import { setDashboard } from './state/moduleRegistry.js';

import { MetricsDashboardModule, clearTableFilters, clearSpecificFilter } from './core/MetricsDashboardModule.js';
import { initTypeaheadFilters } from './init/typeahead-init.js';
import { initD3 } from './init/d3-init.js';
import { logError, ErrorCategory } from './utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────

const ready = fn => document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn);

ready(() => {
  // expose libs
  window.flatpickr = flatpickr;
  window.morphdom = morphdom;

  // init dashboard
  const dashboard = new MetricsDashboardModule();
  dashboard.init('dashboard-container');
  setDashboard(dashboard);

  // expose utils
  window.clearTableFilters = clearTableFilters;
  window.clearSpecificFilter = clearSpecificFilter;

  // init modules
  try { initTypeaheadFilters(); } catch (e) { logError(ErrorCategory.INIT, 'main:typeahead', e); }
  try { initD3(); } catch (e) { logError(ErrorCategory.INIT, 'main:d3', e); }
});
