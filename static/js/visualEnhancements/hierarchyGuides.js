// static/js/visualEnhancements/hierarchyGuides.js

/**
 * Returns CSS classes/styles for hierarchy visuals.
 * @param {string} rowType - 'main', 'peer', or 'hour'
 * @returns {string} CSS class string
 */
export function getHierarchyVisuals(rowType) {
    // These classes should be defined in CSS or handled via inline styles if CSS is not accessible
    // For now, we return classes that we assume exist or will be added, 
    // plus we can return inline styles if needed for immediate effect.

    // We will rely on existing classes but add a specific 'visual-guide' class
    // that can be targeted for enhanced styling (indentation lines).

    return `visual-guide-${rowType}`;
}

export function getHierarchyIndent(rowType) {
    if (rowType === 'peer') return 'padding-left: 24px; position: relative;';
    return '';
}

export function injectHierarchyStyles() {
    if (typeof document === 'undefined') return;
    const id = 'hierarchy-guides-style';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
    .visual-guide-main {
      /* border-left: 4px solid #4f86ff; */
    }
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
    }
  `;
    document.head.appendChild(style);
}

