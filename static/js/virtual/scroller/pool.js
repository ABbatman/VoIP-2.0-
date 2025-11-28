// static/js/virtual/scroller/pool.js
// Responsibility: manage TR pool (create, detach, trim)
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

export function ensurePool(rowPool, needCount) {
  const haveCount = rowPool.length;
  if (haveCount < needCount) {
    for (let i = haveCount; i < needCount; i++) {
      const tr = document.createElement('tr');
      rowPool.push(tr);
    }
  }
}

export function detachExtraRows(rowPool, tbody, startIndex) {
  const detachFrag = document.createDocumentFragment();
  let detachCount = 0;
  for (let i = rowPool.length - 1; i >= startIndex; i--) {
    const tr = rowPool[i];
    if (tr && tr.parentNode === tbody) { detachFrag.appendChild(tr); detachCount++; }
  }
  if (detachFrag.childNodes.length) {
    // Keep nodes detached but retained
  }
  return detachCount;
}

export function trimPool(rowPool, maxPool, needCount, tbody) {
  if (rowPool.length <= maxPool) return;
  const targetSize = Math.max(needCount, maxPool);
  for (let i = rowPool.length - 1; i >= targetSize; i--) {
    const tr = rowPool[i];
    if (tr && tr.parentNode === tbody) {
      try { tbody.removeChild(tr); } catch (e) { logError(ErrorCategory.SCROLL, 'pool', e); }
    }
    rowPool.pop();
  }
}
