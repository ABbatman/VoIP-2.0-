// static/js/dom/components/sort-arrow.js
// Pure renderer: returns HTML string for a sort arrow placeholder (no handlers)
export function renderSortArrow({ key = '', className = '' } = {}) {
  const cls = className ? `sort-arrow ${className}` : 'sort-arrow';
  const keyAttr = key ? ` data-sort-key="${key}"` : '';
  return `<span class="${cls}"${keyAttr}></span>`;
}
