// static/js/virtual/scroller/measurement.js
// Responsibility: Row height measurement and spacer correction
import { getVirtualConfig } from '../../config/virtual-config.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function recomputeRowHeight(vm) {
  if (getVirtualConfig().FIXED_ROW_HEIGHT) return;

  const firstRow = vm.tbody?.querySelector('tr');
  if (!firstRow) return;

  const real = Math.round(firstRow.getBoundingClientRect().height);
  if (!real || real === vm.rowHeight) return;

  vm.rowHeight = real;
  vm.spacer.style.height = `${vm.data.length * vm.rowHeight}px`;

  try { vm.render(true); } catch (e) { logError(ErrorCategory.SCROLL, 'measurement', e); }
}
