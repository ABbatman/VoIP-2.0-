// static/js/dom/top-scrollbar.js
// Responsibility: Top scrollbar sync for wide tables

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const IDS = {
  container: 'top-scrollbar-container',
  content: 'top-scrollbar-content'
};

const TABLE_WRAPPER_SELECTOR = '.results-display__table-wrapper';
const HIDDEN_CLASS = 'is-hidden';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getElements() {
  return {
    container: document.getElementById(IDS.container),
    content: document.getElementById(IDS.content),
    wrapper: document.querySelector(TABLE_WRAPPER_SELECTOR)
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function updateTopScrollbar() {
  const { container, content, wrapper } = getElements();
  if (!container || !content || !wrapper) return;

  const table = wrapper.querySelector('table');
  if (!table) {
    container.classList.add(HIDDEN_CLASS);
    return;
  }

  const scrollWidth = table.scrollWidth;
  const clientWidth = wrapper.clientWidth;

  content.style.width = `${scrollWidth}px`;
  container.classList.toggle(HIDDEN_CLASS, scrollWidth <= clientWidth);
}

export function initTopScrollbar() {
  const { container, wrapper } = getElements();
  if (!container || !wrapper) return;

  window.addEventListener('resize', updateTopScrollbar);

  // two-way sync
  let syncing = false;
  const syncScroll = (source, target) => {
    if (syncing) return;
    syncing = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncing = false; });
  };

  container.addEventListener('scroll', () => syncScroll(container, wrapper));
  wrapper.addEventListener('scroll', () => syncScroll(wrapper, container));
}
