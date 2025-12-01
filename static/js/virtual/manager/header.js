// static/js/virtual/manager/header.js
// Responsibility: Header/footer rendering, sort arrows, Y-columns toggle
import { renderTableHeader, renderTableFooter, updateSortArrows } from '../../dom/table-ui.js';
import { areYColumnsVisible } from '../../state/tableState.js';
import { getYColumnToggleIcon } from '../../dom/hideYColumns.js';
import { bindFloatingHeader } from './ui-sync.js';
import { getYToggleButtons, getResultsTables } from '../selectors/dom-selectors.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Attach to VirtualManager
// ─────────────────────────────────────────────────────────────

export function attachHeader(vm) {
  function syncYToggleIcons() {
    const visible = areYColumnsVisible();
    getYToggleButtons().forEach(btn => { btn.innerHTML = getYColumnToggleIcon(visible); });
    getResultsTables().forEach(tbl => { tbl.classList.toggle('y-columns-hidden', !visible); });
  }

  function renderTableHeaders() {
    try {
      renderTableHeader();
      renderTableFooter();
      updateSortArrows();
      syncYToggleIcons();
      try { bindFloatingHeader(vm); } catch (e) { logError(ErrorCategory.TABLE, 'vmHeader:bindFloating', e); }
    } catch (e) {
      logError(ErrorCategory.TABLE, 'vmHeader:render', e);
    }
  }

  function updateSortArrowsAfterRefresh() {
    try { updateSortArrows(); } catch (e) { logError(ErrorCategory.TABLE, 'vmHeader:sortArrows', e); }
  }

  return { renderTableHeaders, updateSortArrowsAfterRefresh, syncYToggleIcons };
}
