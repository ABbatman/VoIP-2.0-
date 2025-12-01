// static/js/virtual/manager/sticky-calc.js
// Responsibility: Compute layout values for sticky header
import { getContainer, getTable } from '../selectors/dom-selectors.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_HEADER_HEIGHT = 40;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function computeStickyLayout() {
  const container = getContainer();
  const table = getTable();
  const thead = table?.querySelector('thead');

  if (!table || !thead) return { ok: false };

  const tableRect = table.getBoundingClientRect();
  const headerHeight = thead.getBoundingClientRect().height || DEFAULT_HEADER_HEIGHT;

  const width = Math.round(tableRect.width || 0);
  const left = Math.round(tableRect.left || 0);
  const top = Math.round(tableRect.top || 0);
  const bottom = Math.round(tableRect.bottom || 0);

  // invalid if width non-positive
  if (!Number.isFinite(width) || width <= 0) return { ok: false };

  // show when table top reached viewport top and extends below header
  const shouldShow = top <= 0 && bottom > headerHeight;

  let scrollLeft = 0;
  try { scrollLeft = container?.scrollLeft || 0; } catch (e) { logError(ErrorCategory.TABLE, 'stickyCalc', e); }

  return { ok: true, container, table, thead, headerHeight, left, width, shouldShow, scrollLeft };
}
