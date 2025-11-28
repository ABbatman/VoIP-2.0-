// UI Sync module (floating/sticky header)
// Responsibility: manage a floating header synced with the main table
import { toggleYColumnsVisible } from '../../state/tableState.js';
import { getContainer } from '../selectors/dom-selectors.js';
import { computeStickyLayout } from './sticky-calc.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

function measureCellWidths(row) {
  const widths = [];
  if (!row) return widths;
  for (let i = 0; i < row.children.length; i++) {
    const th = row.children[i];
    const rect = th.getBoundingClientRect();
    widths.push(rect.width);
  }
  return widths;
}

// Bind Y-columns toggle button inside floating header
function bindFloatingYToggle(vm) {
  if (!vm || !vm._floatingThead) return;
  const yBtn = vm._floatingThead.querySelector('.y-column-toggle-btn');
  if (!yBtn) return;
  if (yBtn._vm_bound) return;
  yBtn.addEventListener('click', (e) => {
    try { e.preventDefault(); e.stopPropagation(); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
      // Ignore UI sync errors
    }
    try { toggleYColumnsVisible(); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
      // Ignore UI sync errors
    }
  });
  yBtn._vm_bound = true;
}

function applyWidths(row, widths) {
  if (!row || !widths || !widths.length) return;
  for (let i = 0; i < row.children.length && i < widths.length; i++) {
    const th = row.children[i];
    const w = Math.round(widths[i]);
    th.style.boxSizing = 'border-box';
    th.style.width = w + 'px';
    th.style.minWidth = w + 'px';
    th.style.maxWidth = w + 'px';
  }
}

function copyHeaderStyles(srcRow, dstRow) {
  if (!srcRow || !dstRow) return;
  const srcThs = Array.from(srcRow.children || []);
  const dstThs = Array.from(dstRow.children || []);
  if (srcThs.length !== dstThs.length) return;
  const props = [
    'paddingLeft','paddingRight','paddingTop','paddingBottom',
    'fontSize','fontWeight','fontFamily','lineHeight','textTransform',
    'color','backgroundColor','borderRightWidth','borderLeftWidth','borderTopWidth','borderBottomWidth',
    'borderRightStyle','borderLeftStyle','borderTopStyle','borderBottomStyle',
    'borderRightColor','borderLeftColor','borderTopColor','borderBottomColor',
    'textAlign','verticalAlign'
  ];
  srcThs.forEach((s, idx) => {
    const d = dstThs[idx];
    const cs = window.getComputedStyle(s);
    props.forEach(p => { d.style[p] = cs[p]; });
  });
}

// Create floating (page-sticky) header and bind listeners
export function bindFloatingHeader(vm) {
  try {
    // Already created
    if (vm._floatingHeader) {
      try { syncFloatingHeader(vm); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
        // Ignore UI sync errors
      }
      return;
    }

    const layout = computeStickyLayout();
    if (!layout.ok) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'floating-table-header';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.right = '0';
    wrapper.style.zIndex = '60';
    wrapper.style.background = '#fff';
    wrapper.style.display = 'none';
    wrapper.style.boxShadow = '0 2px 4px rgba(0,0,0,0.06)';

    const shadowTable = document.createElement('table');
    shadowTable.className = layout.table.className;
    shadowTable.style.tableLayout = 'fixed';
    shadowTable.style.borderCollapse = 'collapse';
    const clonedThead = layout.thead.cloneNode(true);
    shadowTable.appendChild(clonedThead);
    wrapper.appendChild(shadowTable);

    document.body.appendChild(wrapper);

    vm._floatingHeader = wrapper;
    vm._floatingTable = shadowTable;
    vm._floatingThead = clonedThead;
    try { bindFloatingYToggle(vm); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
      // Ignore UI sync errors
    }

    // rAF-throttle sticky header sync to 1 call per frame
    vm._rafStickyScheduled = false;
    vm._onFloatingSync = () => {
      if (vm._rafStickyScheduled) return;
      vm._rafStickyScheduled = true;
      requestAnimationFrame(() => {
        vm._rafStickyScheduled = false;
        try { syncFloatingHeader(vm); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
          // Ignore UI sync errors
        }
      });
    };
    try { window.addEventListener('resize', vm._onFloatingSync); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
      // Ignore UI sync errors
    }
    try { window.addEventListener('scroll', vm._onFloatingSync, { passive: true }); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
      // Ignore UI sync errors
    }
    const container = getContainer();
    if (container) {
      try { container.addEventListener('scroll', vm._onFloatingSync, { passive: true }); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
        // Ignore UI sync errors
      }
    }

    // Initial sync
    syncFloatingHeader(vm);
  } catch (e) { logError(ErrorCategory.UI, 'uiSync', e); /* no-op */ }
}

export function syncFloatingHeader(vm) {
  try {
    const layout = computeStickyLayout();
    if (!layout.ok || !vm._floatingHeader || !vm._floatingThead) return;

    // If original header structure changed (e.g., reverse swapped columns), re-clone into floating
    try {
      const origSig = Array.from(layout.thead.querySelectorAll('th')).map(th => th.textContent.trim()).join('|');
      if (vm._floatingHeaderSig !== origSig) {
        const newClone = layout.thead.cloneNode(true);
        if (vm._floatingThead && vm._floatingThead.parentNode) {
          vm._floatingThead.parentNode.replaceChild(newClone, vm._floatingThead);
        } else {
          vm._floatingTable.appendChild(newClone);
        }
        vm._floatingThead = newClone;
        vm._floatingHeaderSig = origSig;
        try { bindFloatingYToggle(vm); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
          // Ignore UI sync errors
        }
      }
    } catch (e) { logError(ErrorCategory.UI, 'uiSync', e); /* no-op */ }

    // Show/hide according to computed layout
    const shouldShow = layout.shouldShow;
    vm._floatingHeader.style.display = shouldShow ? 'block' : 'none';

    // Early-exit guard: skip style updates if nothing changed
    const left = layout.left;
    const width = layout.width;
    const prev = vm._lastFloatingRect || {};
    const changed = prev.left !== left || prev.width !== width || prev.show !== shouldShow;
    if (!changed) {
      vm._floatingTable.style.transform = `translateX(${-layout.scrollLeft}px)`;
      return;
    }
    vm._lastFloatingRect = { left, width, show: shouldShow };

    // Match horizontal position and width to the real table
    vm._floatingHeader.style.left = `${left}px`;
    vm._floatingHeader.style.right = 'auto';
    vm._floatingHeader.style.width = `${width}px`;
    vm._floatingTable.style.width = `${width}px`;

    // Measure original header cell widths and apply to floating
    const origRow = layout.thead.querySelector('tr');
    const floatRow = vm._floatingThead.querySelector('tr');
    if (origRow && floatRow) {
      const widths = measureCellWidths(origRow);
      applyWidths(floatRow, widths);
      copyHeaderStyles(origRow, floatRow);
    }

    // Sync horizontal scroll offset: prefer container scrollLeft, fallback 0
    vm._floatingTable.style.transform = `translateX(${-layout.scrollLeft}px)`;
  } catch (e) { logError(ErrorCategory.UI, 'uiSync', e); /* no-op */ }
}

export function unbindFloatingHeader(vm) {
  try {
    if (vm._onFloatingSync) {
      try { window.removeEventListener('resize', vm._onFloatingSync); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
        // Ignore UI sync errors
      }
      try {
        const container = getContainer();
        container && container.removeEventListener('scroll', vm._onFloatingSync);
      } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
        // Ignore UI sync errors
      }
    }
    if (vm._floatingHeader && vm._floatingHeader.parentNode) {
      try { vm._floatingHeader.parentNode.removeChild(vm._floatingHeader); } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
        // Ignore UI sync errors
      }
    }
  } catch(e) { logError(ErrorCategory.UI, 'uiSync', e);
    // Ignore UI sync errors
  }
  vm._floatingHeader = null;
  vm._floatingTable = null;
  vm._floatingThead = null;
  vm._onFloatingSync = null;
}
