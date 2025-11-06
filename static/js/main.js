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
import 'flatpickr/dist/flatpickr.min.css';
import flatpickr from 'flatpickr';
import morphdom from 'morphdom'; // NEW: DOM patching library

import { MetricsDashboardModule, clearTableFilters, clearSpecificFilter } from './core/MetricsDashboardModule.js';
import { initTypeaheadFilters } from './init/typeahead-init.js'; // Typeahead init
import { initD3 } from './init/d3-init.js'; // D3 core init (now bootstraps dashboard lazily)

const ready = (fn) => (document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn));

ready(() => {
  // Expose flatpickr globally for ui-widgets.js which checks `typeof flatpickr`
  window.flatpickr = flatpickr;
  
  // Expose morphdom globally for debugging
  window.morphdom = morphdom;
  
  const dashboard = new MetricsDashboardModule();
  // index.html contains #dashboard-container
  dashboard.init('dashboard-container');
  // Expose for console testing if needed
  window.dashboard = dashboard;
  
  // Expose utility functions globally
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
