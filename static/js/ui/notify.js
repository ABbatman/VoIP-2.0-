// static/js/ui/notify.js
// Responsibility: Minimal toast notifications
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CONTAINER_ID = 'app-toast-container';
const ANIMATION_DURATION_MS = 160;
const REMOVE_DELAY_MS = 180;

const PALETTE = {
  info: { bg: '#0ea5e9', fg: '#ffffff' },
  success: { bg: '#10b981', fg: '#ffffff' },
  warning: { bg: '#f59e0b', fg: '#111827' },
  error: { bg: '#ef4444', fg: '#ffffff' }
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ensureContainer() {
  let c = document.getElementById(CONTAINER_ID);
  if (c) return c;

  c = document.createElement('div');
  c.id = CONTAINER_ID;
  Object.assign(c.style, {
    position: 'fixed',
    zIndex: '2147483647',
    right: '16px',
    top: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none'
  });
  document.body.appendChild(c);
  return c;
}

function createToastElement(message, bg, fg) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    pointerEvents: 'auto',
    maxWidth: '420px',
    padding: '10px 12px',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,.15)',
    background: bg,
    color: fg,
    font: '13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    opacity: '0',
    transform: 'translateY(-4px)',
    transition: `opacity ${ANIMATION_DURATION_MS}ms ease, transform ${ANIMATION_DURATION_MS}ms ease`
  });
  el.textContent = String(message || '');
  return el;
}

function createCloseButton(fg) {
  const btn = document.createElement('button');
  btn.textContent = '×';
  btn.setAttribute('aria-label', 'Close');
  Object.assign(btn.style, {
    marginLeft: '8px',
    padding: '0 6px',
    height: '20px',
    border: 'none',
    background: 'transparent',
    color: fg,
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '20px'
  });
  return btn;
}

function wrapElements(toastEl, closeBtn) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', alignItems: 'center' });
  wrap.appendChild(toastEl);
  wrap.appendChild(closeBtn);

  const item = document.createElement('div');
  Object.assign(item.style, { display: 'flex', alignItems: 'center' });
  item.appendChild(wrap);
  return item;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function toast(message, { type = 'warning', duration = 3000 } = {}) {
  try {
    const container = ensureContainer();
    const { bg, fg } = PALETTE[type] || PALETTE.info;

    const toastEl = createToastElement(message, bg, fg);
    const closeBtn = createCloseButton(fg);
    const item = wrapElements(toastEl, closeBtn);

    container.appendChild(item);
    requestAnimationFrame(() => {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateY(0)';
    });

    const remove = () => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-4px)';
      setTimeout(() => item.parentNode?.removeChild(item), REMOVE_DELAY_MS);
    };

    let timer = setTimeout(remove, duration);
    closeBtn.addEventListener('click', () => { clearTimeout(timer); remove(); });

    return { dismiss: () => { clearTimeout(timer); remove(); } };
  } catch (e) {
    logError(ErrorCategory.UI, 'notify:toast', e);
    return { dismiss: () => {} };
  }
}
