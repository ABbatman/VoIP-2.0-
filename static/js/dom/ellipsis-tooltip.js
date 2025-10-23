// static/js/dom/ellipsis-tooltip.js
// Responsibility: Show a neat tooltip with full text for any truncated (ellipsis) cell

let tooltipEl;

export function initEllipsisTooltip() {
  // Create tooltip once
  tooltipEl = document.getElementById('ellipsis-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'ellipsis-tooltip';
    tooltipEl.className = 'ellipsis-tooltip is-hidden';
    document.body.appendChild(tooltipEl);
  }

  const tableBody = document.getElementById('tableBody');
  const tableHead = document.querySelector('#summaryTable thead');
  const tableFoot = document.querySelector('#summaryTable tfoot');
  if (tableBody) {
    tableBody.addEventListener('mouseover', onOver, { passive: true });
    tableBody.addEventListener('mouseout', onOut, { passive: true });
    tableBody.addEventListener('mousemove', onMove, { passive: true });
  }
  if (tableHead) {
    tableHead.addEventListener('mouseover', onOver, { passive: true });
    tableHead.addEventListener('mouseout', onOut, { passive: true });
    tableHead.addEventListener('mousemove', onMove, { passive: true });
  }
  if (tableFoot) {
    tableFoot.addEventListener('mouseover', onOver, { passive: true });
    tableFoot.addEventListener('mouseout', onOut, { passive: true });
    tableFoot.addEventListener('mousemove', onMove, { passive: true });
  }

  // Also bind to floating header container if present, and observe for future insertions
  bindFloatingHeaderIfPresent();
  observeFloatingHeader();
  // And floating footer
  bindFloatingFooterIfPresent();
  observeFloatingFooter();
  // Update floating footer when Y visibility changes
  const rebinder = () => { bindFloatingFooterIfPresent(); };
  window.addEventListener('tableState:yVisibilityChanged', rebinder);
}

function bindFloatingHeaderIfPresent() {
  const floating = document.querySelector('.floating-table-header');
  if (floating && !floating._ellipsisBound) {
    floating.addEventListener('mouseover', onOver, { passive: true });
    floating.addEventListener('mouseout', onOut, { passive: true });
    floating.addEventListener('mousemove', onMove, { passive: true });
    floating._ellipsisBound = true;
  }
}

function observeFloatingHeader() {
  const observer = new MutationObserver(() => {
    bindFloatingHeaderIfPresent();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function bindFloatingFooterIfPresent() {
  const floating = document.querySelector('.floating-table-footer');
  if (floating && !floating._ellipsisBound) {
    floating.addEventListener('mouseover', onOver, { passive: true });
    floating.addEventListener('mouseout', onOut, { passive: true });
    floating.addEventListener('mousemove', onMove, { passive: true });
    floating._ellipsisBound = true;
  }
}

function observeFloatingFooter() {
  const observer = new MutationObserver(() => {
    bindFloatingFooterIfPresent();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function onOver(e) {
  // Don't interfere with existing ASR tooltip in body
  if (e.target.closest('.asr-cell-hover')) return;
  // Ignore clicks over controls in header
  if (e.target.closest('.y-column-toggle-btn, .sort-arrow')) return;
  // Ignore inputs (user typing) in footer
  if (e.target.closest('input')) return;

  // Detect context: body td or header label
  const td = e.target.closest('td');
  const thLabel = e.target.closest('.th-label');
  const th = thLabel ? thLabel.closest('th') : e.target.closest('th');

  let clampTarget = null;
  let text = '';

  if (td) {
    clampTarget = findEllipsisTarget(e.target) || td;
    if (clampTarget && isEllipsisActive(clampTarget) && isActuallyTruncated(clampTarget)) {
      text = (
        td.getAttribute('data-full-text') ||
        td.getAttribute('data-filter-value') ||
        clampTarget.getAttribute('data-full-text') ||
        ''
      ).trim() || (clampTarget.textContent || '').trim();
    }
  } else if (th && thLabel) {
    clampTarget = findEllipsisTarget(thLabel) || thLabel;
    if (clampTarget && isEllipsisActive(clampTarget) && isActuallyTruncated(clampTarget)) {
      text = (thLabel.getAttribute('data-full-text') || thLabel.textContent || '').trim();
    }
  }

  if (text) {
    tooltipEl.textContent = text;
    tooltipEl.classList.remove('is-hidden');
  }
}

function onOut() {
  tooltipEl.classList.add('is-hidden');
}

function onMove(e) {
  if (tooltipEl.classList.contains('is-hidden')) return;
  const x = e.clientX + 12;
  const y = e.clientY + 14;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

function findEllipsisTarget(start) {
  let node = start;
  const limit = 5; // don't traverse too far
  let steps = 0;
  while (node && steps < limit) {
    const cs = window.getComputedStyle(node);
    if (cs && cs.textOverflow === 'ellipsis') return node;
    node = node.parentElement;
    steps += 1;
  }
  return null;
}

function isEllipsisActive(el) {
  const cs = window.getComputedStyle(el);
  return cs && cs.overflow === 'hidden' && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap';
}

function isActuallyTruncated(el) {
  // Prefer the element itself; if it has a single child text wrapper, compare that too
  if (el.scrollWidth > el.clientWidth + 1) return true;
  const child = el.firstElementChild;
  if (child && child.scrollWidth > el.clientWidth + 1) return true;
  return false;
}


