// static/js/dom/components/header-cell.js
// Pure renderer: returns HTML string for a header cell with label, optional Y toggle, and sort arrow
import { areYColumnsVisible } from '../../state/tableState.js';
import { getYColumnToggleIcon } from '../hideYColumns.js';

export function renderHeaderCellString({ col, reverse = false } = {}) {
  const key = col.key;
  const headerClass = col.headerClass ? ` ${col.headerClass}` : '';
  const yAttr = col.isYColumn ? ' data-y-toggleable="true"' : '';
  const label = typeof col.label === 'function' ? col.label(reverse) : (col.label || '');

  // optional Y toggle only for main column
  const yToggle = key === 'main'
    ? `<button class="y-column-toggle-btn" title="Toggle Y columns">${getYColumnToggleIcon(areYColumnsVisible())}</button>`
    : '';

  // sort arrow placeholder (delegated handler will process clicks)
  const sortArrow = `<span class="sort-arrow" data-sort-key="${key}"></span>`;

  return `<th data-sort-key="${key}" class="th${headerClass}"${yAttr}>`+
           `<div class="th-content-wrapper">`+
             `<div class="th-left-part"><span class="th-label">${escapeHtml(label)}</span>${yToggle}</div>`+
             `${sortArrow}`+
           `</div>`+
         `</th>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
