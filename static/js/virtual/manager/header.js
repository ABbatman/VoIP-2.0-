// static/js/virtual/manager/header.js
// Layer: header+UI helpers (render header/footer, sort arrows, Y-columns icon)

import { renderTableHeader, renderTableFooter, updateSortArrows } from '../../dom/table-ui.js';
import { areYColumnsVisible } from '../../state/tableState.js';
import { getYColumnToggleIcon } from '../../dom/hideYColumns.js';
import { bindFloatingHeader } from './ui-sync.js';
import { getYToggleButtons, getResultsTables } from '../selectors/dom-selectors.js';

function logDebug(...args) {
  try { if (typeof window !== 'undefined' && window.DEBUG) console.log(...args); } catch (_) {}
}

export function attachHeader(vm) {
  function renderTableHeaders() {
    try {
      logDebug('🔄 Header: render with sorting');
      renderTableHeader();
      renderTableFooter();
      updateSortArrows();
      syncYToggleIcons();
      try { bindFloatingHeader(vm); } catch (_) {}
      logDebug('✅ Header: ready');
    } catch (error) {
      console.error('❌ Header: render failed', error);
    }
  }

  function updateSortArrowsAfterRefresh() {
    try { updateSortArrows(); } catch (error) {
      console.error('❌ Header: updateSortArrowsAfterRefresh failed', error);
    }
  }

  function syncYToggleIcons() {
    const visible = areYColumnsVisible();
    getYToggleButtons().forEach(btn => {
      btn.innerHTML = getYColumnToggleIcon(visible);
    });
    getResultsTables().forEach(tbl => {
      if (visible) tbl.classList.remove('y-columns-hidden');
      else tbl.classList.add('y-columns-hidden');
    });
  }

  return { renderTableHeaders, updateSortArrowsAfterRefresh, syncYToggleIcons };
}
