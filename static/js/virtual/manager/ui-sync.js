// static/js/virtual/manager/ui-sync.js
// Responsibility: Floating/sticky header management
import { toggleYColumnsVisible } from '../../state/tableState.js';
import { getContainer } from '../selectors/dom-selectors.js';
import { computeStickyLayout } from './sticky-calc.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STYLE_PROPS = [
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'textTransform',
  'color', 'backgroundColor',
  'borderRightWidth', 'borderLeftWidth', 'borderTopWidth', 'borderBottomWidth',
  'borderRightStyle', 'borderLeftStyle', 'borderTopStyle', 'borderBottomStyle',
  'borderRightColor', 'borderLeftColor', 'borderTopColor', 'borderBottomColor',
  'textAlign', 'verticalAlign'
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function measureCellWidths(row) {
  if (!row) return [];
  const children = row.children;
  const len = children.length;
  const widths = [];
  for (let i = 0; i < len; i++) {
    widths.push(children[i].getBoundingClientRect().width);
  }
  return widths;
}

function applyWidths(row, widths) {
  if (!row || !widths?.length) return;
  const children = row.children;
  const len = Math.min(children.length, widths.length);
  for (let i = 0; i < len; i++) {
    const w = Math.round(widths[i]) + 'px';
    const style = children[i].style;
    style.boxSizing = 'border-box';
    style.width = w;
    style.minWidth = w;
    style.maxWidth = w;
  }
}

// Cache length for indexed loop
const STYLE_PROPS_LEN = STYLE_PROPS.length;

function copyHeaderStyles(srcRow, dstRow) {
  if (!srcRow || !dstRow) return;
  const srcThs = srcRow.children || [];
  const dstThs = dstRow.children || [];
  const len = srcThs.length;
  if (len !== dstThs.length) return;

  for (let i = 0; i < len; i++) {
    const cs = window.getComputedStyle(srcThs[i]);
    const dstStyle = dstThs[i].style;
    for (let j = 0; j < STYLE_PROPS_LEN; j++) {
      const p = STYLE_PROPS[j];
      dstStyle[p] = cs[p];
    }
  }
}

function bindFloatingYToggle(vm) {
  if (!vm?._floatingThead) return;
  const yBtn = vm._floatingThead.querySelector('.y-column-toggle-btn');
  if (!yBtn || yBtn._vm_bound) return;

  yBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    try { toggleYColumnsVisible(); } catch (err) { logError(ErrorCategory.UI, 'uiSync:yToggle', err); }
  });
  yBtn._vm_bound = true;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function bindFloatingHeader(vm) {
  if (vm._floatingHeader) {
    syncFloatingHeader(vm);
    return;
  }

  const layout = computeStickyLayout();
  if (!layout.ok) return;

  // create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'floating-table-header';
  Object.assign(wrapper.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '60',
    background: '#fff', display: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
  });

  // create shadow table
  const shadowTable = document.createElement('table');
  shadowTable.className = layout.table.className;
  Object.assign(shadowTable.style, { tableLayout: 'fixed', borderCollapse: 'collapse' });
  const clonedThead = layout.thead.cloneNode(true);
  shadowTable.appendChild(clonedThead);
  wrapper.appendChild(shadowTable);
  document.body.appendChild(wrapper);

  vm._floatingHeader = wrapper;
  vm._floatingTable = shadowTable;
  vm._floatingThead = clonedThead;
  bindFloatingYToggle(vm);

  // rAF-throttled sync
  vm._rafStickyScheduled = false;
  vm._onFloatingSync = () => {
    if (vm._rafStickyScheduled) return;
    vm._rafStickyScheduled = true;
    requestAnimationFrame(() => {
      vm._rafStickyScheduled = false;
      syncFloatingHeader(vm);
    });
  };

  window.addEventListener('resize', vm._onFloatingSync);
  window.addEventListener('scroll', vm._onFloatingSync, { passive: true });
  getContainer()?.addEventListener('scroll', vm._onFloatingSync, { passive: true });

  syncFloatingHeader(vm);
}

export function syncFloatingHeader(vm) {
  const layout = computeStickyLayout();
  if (!layout.ok || !vm._floatingHeader || !vm._floatingThead) return;

  // re-clone if header structure changed
  const origSig = Array.from(layout.thead.querySelectorAll('th')).map(th => th.textContent.trim()).join('|');
  if (vm._floatingHeaderSig !== origSig) {
    const newClone = layout.thead.cloneNode(true);
    vm._floatingThead.parentNode?.replaceChild(newClone, vm._floatingThead) ?? vm._floatingTable.appendChild(newClone);
    vm._floatingThead = newClone;
    vm._floatingHeaderSig = origSig;
    bindFloatingYToggle(vm);
  }

  // show/hide
  vm._floatingHeader.style.display = layout.shouldShow ? 'block' : 'none';

  // early-exit if nothing changed
  const { left, width, shouldShow } = layout;
  const prev = vm._lastFloatingRect || {};
  if (prev.left === left && prev.width === width && prev.show === shouldShow) {
    vm._floatingTable.style.transform = `translateX(${-layout.scrollLeft}px)`;
    return;
  }
  vm._lastFloatingRect = { left, width, show: shouldShow };

  // update position/width
  Object.assign(vm._floatingHeader.style, { left: `${left}px`, right: 'auto', width: `${width}px` });
  vm._floatingTable.style.width = `${width}px`;

  // sync cell widths and styles
  const origRow = layout.thead.querySelector('tr');
  const floatRow = vm._floatingThead.querySelector('tr');
  if (origRow && floatRow) {
    applyWidths(floatRow, measureCellWidths(origRow));
    copyHeaderStyles(origRow, floatRow);
  }

  vm._floatingTable.style.transform = `translateX(${-layout.scrollLeft}px)`;
}

export function unbindFloatingHeader(vm) {
  if (vm._onFloatingSync) {
    window.removeEventListener('resize', vm._onFloatingSync);
    window.removeEventListener('scroll', vm._onFloatingSync);
    getContainer()?.removeEventListener('scroll', vm._onFloatingSync);
  }

  vm._floatingHeader?.parentNode?.removeChild(vm._floatingHeader);
  vm._floatingHeader = null;
  vm._floatingTable = null;
  vm._floatingThead = null;
  vm._onFloatingSync = null;
}
