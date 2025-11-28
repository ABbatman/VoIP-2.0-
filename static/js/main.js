// Vite entry: import all CSS and bootstrap dashboard
import '/css/tokens.css'; // design tokens (colors, fonts, spacing)
import '/css/components.css'; // design system utilities (header layout)
import '/css/filters-panel.css';
import '/css/results-display.css';
import '/css/table-header.css';
import '/css/layout.css';
import '/css/top-scrollbar.css';
import '/css/hideYColumns.css';
import '/css/feedback.css';
import '/css/virtual.css';
import '/css/renderer.css'; // NEW: Dashboard renderer styles
import '/css/unified-style.css'; // unified minimal refinements
import 'flatpickr/dist/flatpickr.min.css';
import flatpickr from 'flatpickr';
import morphdom from 'morphdom'; // NEW: DOM patching library

// Init runtime flags and module registry early (provides backward-compatible window.* bridge)
import './state/runtimeFlags.js';
import './state/moduleRegistry.js';
import { setDashboard } from './state/moduleRegistry.js';

import { MetricsDashboardModule, clearTableFilters, clearSpecificFilter } from './core/MetricsDashboardModule.js';
import { initTypeaheadFilters } from './init/typeahead-init.js'; // Typeahead init
import { initD3 } from './init/d3-init.js'; // D3 core init (now bootstraps dashboard lazily)

const ready = (fn) => (document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn));

ready(() => {
  // Libraries: expose on window for external checks (typeof flatpickr)
  window.flatpickr = flatpickr;
  window.morphdom = morphdom;
  
  // Dashboard: use centralized registry
  const dashboard = new MetricsDashboardModule();
  dashboard.init('dashboard-container');
  setDashboard(dashboard);
  
  // Utility functions for console/external use
  window.clearTableFilters = clearTableFilters;
  window.clearSpecificFilter = clearSpecificFilter;

  // Init filters typeahead (isolated module)
  try { initTypeaheadFilters(); } catch (_) { /* no-op */ }
  // Init D3 (exposes window.d3; also lazy-loads dashboard)
  try { initD3(); } catch (_) { /* no-op */ }
  // Do not call initD3Dashboard directly — initD3 will import and run it lazily
  // (avoid double initialization and race conditions)
})
;
