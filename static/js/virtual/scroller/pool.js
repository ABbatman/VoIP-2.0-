// static/js/virtual/scroller/pool.js
// Responsibility: TR pool management (create, detach, trim)
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function ensurePool(rowPool, needCount) {
  while (rowPool.length < needCount) {
    rowPool.push(document.createElement('tr'));
  }
}

export function detachExtraRows(rowPool, tbody, startIndex) {
  const frag = document.createDocumentFragment();
  let count = 0;

  for (let i = rowPool.length - 1; i >= startIndex; i--) {
    const tr = rowPool[i];
    if (tr?.parentNode === tbody) {
      frag.appendChild(tr);
      count++;
    }
  }
  return count;
}

export function trimPool(rowPool, maxPool, needCount, tbody) {
  if (rowPool.length <= maxPool) return;

  const targetSize = Math.max(needCount, maxPool);

  for (let i = rowPool.length - 1; i >= targetSize; i--) {
    const tr = rowPool[i];
    if (tr?.parentNode === tbody) {
      try { tbody.removeChild(tr); } catch (e) { logError(ErrorCategory.SCROLL, 'pool:trim', e); }
    }
    rowPool.pop();
  }
}
