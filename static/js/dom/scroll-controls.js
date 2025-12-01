// static/js/dom/scroll-controls.js
// Responsibility: Scroll-to-top button handler

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SCROLL_TOP_BTN_SELECTOR = '.scroll-top-btn';
const VIRTUAL_CONTAINER_ID = 'virtual-scroll-container';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function smoothScrollToTop(el) {
  try {
    el.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    // fallback for older browsers
    if (el === window) {
      window.scrollTo(0, 0);
    } else {
      el.scrollTop = 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initScrollControls() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest(SCROLL_TOP_BTN_SELECTOR)) return;

    smoothScrollToTop(window);

    const container = document.getElementById(VIRTUAL_CONTAINER_ID);
    if (container) {
      smoothScrollToTop(container);
    }
  }, { passive: true });
}
