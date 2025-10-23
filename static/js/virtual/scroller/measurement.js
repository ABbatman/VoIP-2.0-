// static/js/virtual/scroller/measurement.js
// Responsibility: row height measurement and spacer correction
import { getVirtualConfig } from '../../config/virtual-config.js';

export function recomputeRowHeight(vm) {
  const fixedHeight = getVirtualConfig().FIXED_ROW_HEIGHT === true;
  if (fixedHeight) return;
  const firstRow = vm.tbody.querySelector('tr');
  if (!firstRow) return;
  const real = Math.round(firstRow.getBoundingClientRect().height);
  if (!real || real === vm.rowHeight) return;
  vm.rowHeight = real;
  const corrected = vm.data.length * vm.rowHeight;
  vm.spacer.style.height = `${corrected}px`;
  try { vm.render(true); } catch (_) {}
}
