// static/js/virtual/scroller/patch.js
// Responsibility: Patch visible rows in-place without full render
import { applyRowDiff } from './diff.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ROW_CLASS_MAP = {
  main: 'main-row',
  peer: 'peer-row',
  hourly: 'hour-row'
};

function getRowClass(rowData) {
  if (rowData.level === 0 || rowData.type === 'main') return ROW_CLASS_MAP.main;
  if (rowData.level === 1 || rowData.type === 'peer') return ROW_CLASS_MAP.peer;
  if (rowData.level === 2 || rowData.type === 'hourly') return ROW_CLASS_MAP.hourly;
  return '';
}

function syncDataset(el, key, value) {
  if (el.dataset[key] !== value) el.dataset[key] = value;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function patchRowAt(vm, index) {
  if (!vm.isInitialized || !vm.data || !vm._rowPool) return;
  if (index < 0 || index >= vm.data.length) return;
  if (vm.lastStartIndex === undefined || vm.lastEndIndex === undefined) return;
  if (index < vm.lastStartIndex || index >= vm.lastEndIndex) return;

  const tr = vm._rowPool[index - vm.lastStartIndex];
  if (!tr) return;

  const rowData = vm.data[index];

  // sync class
  const desiredClass = getRowClass(rowData);
  if (tr.className !== desiredClass) tr.className = desiredClass;

  // sync role
  if (!tr._roleSet) { tr.setAttribute('role', 'row'); tr._roleSet = true; }

  // sync dataset
  syncDataset(tr, 'key', rowData.groupId || `${rowData.type || 'row'}-${index}`);
  syncDataset(tr, 'virtualIndex', String(index));
  syncDataset(tr, 'group', rowData.parentId || '');

  // diff cells
  const html = vm.renderRowFn?.(rowData) ?? vm.defaultRowRenderer(rowData);
  vm._scratchTbody = applyRowDiff(tr, html, vm._scratchTbody);
}

export function patchRowsRange(vm, rangeStart, rowsArray, options = {}) {
  if (!rowsArray?.length) return;

  const start = Math.max(0, rangeStart);
  const end = Math.min(vm.data.length, rangeStart + rowsArray.length);
  if (start >= end) return;

  // update backing data
  for (let i = 0; i < end - start; i++) {
    vm.data[start + i] = rowsArray[i];
  }

  // full render if forced or no visible window
  if (options.forceRender || vm.lastStartIndex === undefined || vm.lastEndIndex === undefined) {
    vm.render(!!options.forceRender);
    return;
  }

  // patch only overlapping visible rows
  const overlapStart = Math.max(start, vm.lastStartIndex);
  const overlapEnd = Math.min(end, vm.lastEndIndex);

  for (let idx = overlapStart; idx < overlapEnd; idx++) {
    patchRowAt(vm, idx);
  }
}
