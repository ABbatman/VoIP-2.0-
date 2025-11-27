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

  // Bind to virtual scroll container (covers all table rows)
  const virtualContainer = document.getElementById('virtual-scroll-container');
  if (virtualContainer && !virtualContainer._ellipsisBound) {
    virtualContainer.addEventListener('mouseover', onOver, { passive: true });
    virtualContainer.addEventListener('mouseout', onOut, { passive: true });
    virtualContainer.addEventListener('mousemove', onMove, { passive: true });
    virtualContainer._ellipsisBound = true;
  }

  // Fallback: bind to tableBody if virtual container not found
  const tableBody = document.getElementById('tableBody');
  if (tableBody && !tableBody._ellipsisBound && !virtualContainer) {
    tableBody.addEventListener('mouseover', onOver, { passive: true });
    tableBody.addEventListener('mouseout', onOut, { passive: true });
    tableBody.addEventListener('mousemove', onMove, { passive: true });
    tableBody._ellipsisBound = true;
  }

  // Bind to floating elements
  bindFloatingHeaderIfPresent();
  observeFloatingHeader();
  bindFloatingFooterIfPresent();
  observeFloatingFooter();

  // Re-bind when table becomes visible (virtual container may be created later)
  observeVirtualContainer();
}

function observeVirtualContainer() {
  const observer = new MutationObserver(() => {
    const vc = document.getElementById('virtual-scroll-container');
    if (vc && !vc._ellipsisBound) {
      vc.addEventListener('mouseover', onOver, { passive: true });
      vc.addEventListener('mouseout', onOut, { passive: true });
      vc.addEventListener('mousemove', onMove, { passive: true });
      vc._ellipsisBound = true;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
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
  // Don't interfere with existing ASR tooltip
  if (e.target.closest('.asr-cell-hover')) return;
  // Ignore controls
  if (e.target.closest('.y-column-toggle-btn, .sort-arrow, .toggle-btn, input')) return;

  const td = e.target.closest('td');
  if (!td) return;

  // Get full text from data attribute
  const fullText = td.getAttribute('data-full-text') || td.getAttribute('data-filter-value') || '';
  if (!fullText) return;

  // Check if text is truncated (overflow)
  const isTruncated = td.scrollWidth > td.clientWidth + 2;
  if (!isTruncated) return;

  // Show tooltip
  tooltipEl.textContent = fullText;
  tooltipEl.classList.remove('is-hidden');
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
