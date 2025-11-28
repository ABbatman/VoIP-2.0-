// static/js/virtual/manager/sticky-calc.js
// Responsibility: compute layout values for sticky (page-fixed) header safely
// Guards against atypical layouts (overflow, zero/invalid widths)
import { getContainer, getTable } from '../selectors/dom-selectors.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

export function computeStickyLayout() {
  const container = getContainer();
  const table = getTable();
  const thead = table ? table.querySelector('thead') : null;
  if (!table || !thead) return { ok: false };

  const tableRect = table.getBoundingClientRect();
  const headerHeight = thead.getBoundingClientRect().height || 40;

  // Atypical layouts protection
  const width = Math.round(tableRect.width || 0);
  const left = Math.round(tableRect.left || 0);
  const top = Math.round(tableRect.top || 0);
  const bottom = Math.round(tableRect.bottom || 0);
  // Invalid when width is non-positive or table not in viewport metrics
  if (!Number.isFinite(width) || width <= 0) return { ok: false };

  // Should show when table top has reached viewport top and table still extends below header
  const shouldShow = top <= 0 && bottom > headerHeight;

  // Container overflow guard: still allow sticky, but ensure horizontal transform follows container scroll
  let scrollLeft = 0;
  try { scrollLeft = container ? (container.scrollLeft || 0) : 0; } catch (e) { logError(ErrorCategory.TABLE, 'stickyCalc', e); scrollLeft = 0; }

  return {
    ok: true,
    container,
    table,
    thead,
    headerHeight,
    left,
    width,
    shouldShow,
    scrollLeft,
  };
}
