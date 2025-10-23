// static/js/dom/components/button.js
// Pure renderer: returns HTML string for a button (no event handlers, no inline styles)
export function renderButton({ id = '', className = '', title = '', text = '', icon = '' } = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  const titleAttr = title ? ` title="${title}"` : '';
  const cls = className ? ` ${className}` : '';
  // icon: HTML string for inline SVG or empty
  const iconPart = icon ? `${icon}` : '';
  const textPart = text ? `${text}` : '';
  return `<button${idAttr} class="${cls.trim()}"${titleAttr}>${iconPart}${textPart}</button>`;
}
