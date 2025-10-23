// static/js/virtual/scroller/diff.js
// Responsibility: partial diff between existing TR and new row html

export function applyRowDiff(tr, html, scratchTbody) {
  if (tr._htmlCache === html) return scratchTbody; // nothing to do
  if (!scratchTbody) scratchTbody = document.createElement('tbody');
  scratchTbody.innerHTML = `<tr>${html}</tr>`;
  const srcTr = scratchTbody.firstElementChild;
  const srcCells = srcTr ? srcTr.children : [];
  const dstCells = tr.children;

  if (!srcTr || dstCells.length !== srcCells.length) {
    try {
      if (typeof window !== 'undefined' && window.DEBUG) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ renderRowFn contract: cell count mismatch; falling back to full row replace', {
          srcCount: srcCells.length,
          dstCount: dstCells.length
        });
      }
    } catch (_) {}
    tr.innerHTML = html;
  } else {
    for (let c = 0; c < srcCells.length; c++) {
      const s = srcCells[c];
      const d = dstCells[c];
      // Class update
      if (d.className !== s.className) d.className = s.className;
      // Copy key data-* attributes used in UI logic
      const pdd = s.getAttribute('data-pdd');
      if (pdd !== null) { if (d.getAttribute('data-pdd') !== pdd) d.setAttribute('data-pdd', pdd); } else if (d.hasAttribute('data-pdd')) { d.removeAttribute('data-pdd'); }
      const atime = s.getAttribute('data-atime');
      if (atime !== null) { if (d.getAttribute('data-atime') !== atime) d.setAttribute('data-atime', atime); } else if (d.hasAttribute('data-atime')) { d.removeAttribute('data-atime'); }
      const yToggle = s.getAttribute('data-y-toggleable');
      if (yToggle !== null) { if (d.getAttribute('data-y-toggleable') !== yToggle) d.setAttribute('data-y-toggleable', yToggle); } else if (d.hasAttribute('data-y-toggleable')) { d.removeAttribute('data-y-toggleable'); }
      // Filter cells carry extra attributes
      const isFilterCell = d.classList && (d.classList.contains('main-cell') || d.classList.contains('peer-cell') || d.classList.contains('destination-cell') || d.classList.contains('hour-datetime'));
      if (isFilterCell) {
        const filterVal = s.getAttribute('data-filter-value');
        if (filterVal !== null) { if (d.getAttribute('data-filter-value') !== filterVal) d.setAttribute('data-filter-value', filterVal); } else if (d.hasAttribute('data-filter-value')) { d.removeAttribute('data-filter-value'); }
        const fullText = s.getAttribute('data-full-text');
        if (fullText !== null) { if (d.getAttribute('data-full-text') !== fullText) d.setAttribute('data-full-text', fullText); } else if (d.hasAttribute('data-full-text')) { d.removeAttribute('data-full-text'); }
        // Contract validation: when DEBUG, warn if filter cell lacks required data-* on source
        try {
          if (typeof window !== 'undefined' && window.DEBUG) {
            const hasAny = (filterVal !== null) || (fullText !== null) || (s.textContent && s.textContent.trim());
            if (!hasAny) {
              // eslint-disable-next-line no-console
              console.warn('⚠️ renderRowFn contract: filter cell missing data-* (data-filter-value or data-full-text)');
            }
          }
        } catch (_) {}
      }
      // Text/HTML content
      const sHasChildren = s.children && s.children.length > 0;
      const dHasChildren = d.children && d.children.length > 0;
      if (!sHasChildren && !dHasChildren) {
        if (d.textContent !== s.textContent) d.textContent = s.textContent;
      } else {
        if (d.innerHTML !== s.innerHTML) d.innerHTML = s.innerHTML;
      }
    }
  }
  tr._htmlCache = html;
  return scratchTbody;
}
