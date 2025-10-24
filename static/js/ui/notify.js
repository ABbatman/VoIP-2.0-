// static/js/ui/notify.js

// Minimal toast utility without external CSS. Non-blocking, auto-dismiss.
// Usage: import { toast } from '../ui/notify.js'; toast('Message', { type: 'warning', duration: 3000 });

function ensureContainer() {
  let c = document.getElementById('app-toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'app-toast-container';
    c.style.position = 'fixed';
    c.style.zIndex = '2147483647';
    c.style.right = '16px';
    c.style.top = '16px';
    c.style.display = 'flex';
    c.style.flexDirection = 'column';
    c.style.gap = '8px';
    c.style.pointerEvents = 'none';
    document.body.appendChild(c);
  }
  return c;
}

function styleFor(type = 'info') {
  const palette = {
    info: { bg: '#0ea5e9', fg: '#ffffff' },
    success: { bg: '#10b981', fg: '#ffffff' },
    warning: { bg: '#f59e0b', fg: '#111827' },
    error: { bg: '#ef4444', fg: '#ffffff' },
  };
  return palette[type] || palette.info;
}

export function toast(message, { type = 'warning', duration = 3000 } = {}) {
  try {
    const c = ensureContainer();
    const { bg, fg } = styleFor(type);
    const t = document.createElement('div');
    t.setAttribute('role', 'status');
    t.style.pointerEvents = 'auto';
    t.style.maxWidth = '420px';
    t.style.padding = '10px 12px';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 10px 25px rgba(0,0,0,.15)';
    t.style.background = bg;
    t.style.color = fg;
    t.style.font = '13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    t.style.opacity = '0';
    t.style.transform = 'translateY(-4px)';
    t.style.transition = 'opacity 160ms ease, transform 160ms ease';
    t.textContent = String(message || '');

    // Close button
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.setAttribute('aria-label', 'Close');
    btn.style.marginLeft = '8px';
    btn.style.padding = '0 6px';
    btn.style.height = '20px';
    btn.style.border = 'none';
    btn.style.background = 'transparent';
    btn.style.color = fg;
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '14px';
    btn.style.lineHeight = '20px';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.appendChild(t);
    wrap.appendChild(btn);

    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.appendChild(wrap);

    c.appendChild(item);
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateY(0)';
    });

    const remove = () => {
      try {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-4px)';
        setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 180);
      } catch(_) {}
    };

    let timer = setTimeout(remove, duration);
    btn.addEventListener('click', () => { clearTimeout(timer); remove(); });

    return { dismiss: () => { clearTimeout(timer); remove(); } };
  } catch (_) {
    // last resort, avoid blocking alerts
    try { console.warn('[toast]', message); } catch(e) {}
    return { dismiss: () => {} };
  }
}
