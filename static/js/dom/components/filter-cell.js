// static/js/dom/components/filter-cell.js
// Pure renderer: returns HTML string for a filter cell with input (no handlers)
export function renderFilterCell({ key = '', placeholder = '', value = '', isYColumn = false } = {}) {
  const tdAttrs = isYColumn ? ' data-y-toggleable="true"' : '';
  const ph = placeholder ? ` placeholder="${placeholder}"` : '';
  const val = value ? ` value="${value}"` : '';
  const keyAttr = key ? ` data-filter-key="${key}"` : '';
  return `<td${tdAttrs}><input type="text"${keyAttr}${ph}${val}></td>`;
}
