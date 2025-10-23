// static/js/dom/scroll-controls.js
// Responsibility: Controls related to scrolling actions (e.g., scroll to top)

export function initScrollControls() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.scroll-top-btn');
    if (!btn) return;

    // Scroll page and container to top
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (_) {
      window.scrollTo(0, 0);
    }

    const container = document.getElementById('virtual-scroll-container');
    if (container) {
      try {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {
        container.scrollTop = 0;
      }
    }
  }, { passive: true });
}


