// static/js/virtual/scroller/patch.js
// Responsibility: patch visible rows in-place without full render
import { applyRowDiff } from './diff.js';

export function patchRowAt(vm, index) {
  if (!vm.isInitialized || !vm.data || !vm._rowPool) return;
  if (index < 0 || index >= vm.data.length) return;
  if (vm.lastStartIndex === undefined || vm.lastEndIndex === undefined) return;
  if (index < vm.lastStartIndex || index >= vm.lastEndIndex) return;
  const poolIdx = index - vm.lastStartIndex;
  const tr = vm._rowPool[poolIdx];
  if (!tr) return;
  const rowData = vm.data[index];
  // Ensure metadata
  let desiredClass = '';
  if (rowData.level === 0 || rowData.type === 'main') desiredClass = 'main-row';
  else if (rowData.level === 1 || rowData.type === 'peer') desiredClass = 'peer-row';
  else if (rowData.level === 2 || rowData.type === 'hourly') desiredClass = 'hour-row';
  if (tr.className !== desiredClass) tr.className = desiredClass;
  if (!tr._roleSet) { tr.setAttribute('role', 'row'); tr._roleSet = true; }
  const desiredKey = rowData.groupId || `${rowData.type || 'row'}-${index}`;
  if (tr.dataset.key !== desiredKey) tr.dataset.key = desiredKey;
  const desiredIndex = String(index);
  if (tr.dataset.virtualIndex !== desiredIndex) tr.dataset.virtualIndex = desiredIndex;
  const desiredGroup = rowData.parentId || '';
  if (tr.dataset.group !== desiredGroup) tr.dataset.group = desiredGroup;
  // Diff cells
  const html = vm.renderRowFn ? vm.renderRowFn(rowData) : vm.defaultRowRenderer(rowData);
  vm._scratchTbody = applyRowDiff(tr, html, vm._scratchTbody);
}

export function patchRowsRange(vm, rangeStart, rowsArray, options = {}) {
  if (!Array.isArray(rowsArray) || rowsArray.length === 0) return;
  const end = Math.min(vm.data.length, rangeStart + rowsArray.length);
  const start = Math.max(0, rangeStart);
  if (start >= end) return;
  // Update backing data slice
  for (let i = 0; i < end - start; i++) {
    vm.data[start + i] = rowsArray[i];
  }
  const forceRender = options.forceRender === true;
  // If no visible window or forced, trigger render
  if (forceRender || vm.lastStartIndex === undefined || vm.lastEndIndex === undefined) {
    vm.render(!!forceRender);
    return;
  }
  // Patch only overlapping visible rows
  const visStart = vm.lastStartIndex;
  const visEnd = vm.lastEndIndex; // exclusive
  const overlapStart = Math.max(start, visStart);
  const overlapEnd = Math.min(end, visEnd);
  if (overlapStart >= overlapEnd) return;
  for (let idx = overlapStart; idx < overlapEnd; idx++) {
    patchRowAt(vm, idx);
  }
}
