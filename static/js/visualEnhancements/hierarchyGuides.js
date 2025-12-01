// static/js/visualEnhancements/hierarchyGuides.js
// Responsibility: CSS hierarchy visuals for table rows

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STYLE_ID = 'hierarchy-guides-style';

const STYLES = `
.visual-guide-peer {
  position: relative;
}
.visual-guide-peer::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: rgba(79, 134, 255, 0.3);
}
.visual-guide-hour {
  position: relative;
}
.visual-guide-hour::before {
  content: '';
  position: absolute;
  left: 36px;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: rgba(79, 134, 255, 0.15);
}`;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export const getHierarchyVisuals = rowType => `visual-guide-${rowType}`;

export const getHierarchyIndent = rowType =>
  rowType === 'peer' ? 'padding-left: 24px; position: relative;' : '';

export function injectHierarchyStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.innerHTML = STYLES;
  document.head.appendChild(style);
}

