// static/js/charts/controls/providerStackControl.js
// Adds a Bar-only checkbox to toggle per-provider stacking for ECharts Bar

import { subscribe, publish } from '../../state/eventBus.js';

function buildCheckboxEl() {
  const wrap = document.createElement('label');
  wrap.className = 'charts-toggle charts-toggle--suppliers';
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  wrap.style.marginLeft = '12px';
  wrap.style.padding = '4px 8px';
  wrap.style.borderRadius = '6px';
  wrap.style.border = '1px solid rgba(0,0,0,0.08)';
  wrap.style.background = 'rgba(0,0,0,0.02)';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'charts-bar-per-provider';
  input.className = 'charts-toggle__input';
  try { input.style.accentColor = '#4f86ff'; } catch(_) {
    // Ignore style setting errors
  }
  const span = document.createElement('span');
  span.textContent = 'Suppliers';
  span.className = 'charts-toggle__label';
  span.style.fontSize = '12px';
  span.style.fontWeight = '600';
  span.style.color = '#6e7781';
  wrap.appendChild(input);
  wrap.appendChild(span);
  return { wrap, input };
}

function isBarType() {
  try {
    const controls = document.getElementById('charts-controls');
    const t = controls?.dataset?.type;
    return t === 'bar';
  } catch(_) { return false; }
}

export function initProviderStackControl() {
  try {
    const controls = document.getElementById('charts-controls');
    if (!controls) return;
    // avoid duplicates
    let existing = controls.querySelector('.charts-toggle--suppliers');
    if (!existing) {
      const { wrap, input } = buildCheckboxEl();
      controls.appendChild(wrap);
      // restore state
      try { input.checked = !!window.__chartsBarPerProvider; } catch(_) {
        // Ignore state restoration errors
      }
      input.addEventListener('change', () => {
        const checked = !!input.checked;
        try { window.__chartsBarPerProvider = checked; } catch(_) {
          // Ignore global state update errors
        }
        try { publish('charts:bar:perProviderChanged', { perProvider: checked }); } catch(_) {
          // Ignore event publishing errors
        }
      });
    } else {
      const input = existing.querySelector('input');
      if (input) {
        try { input.checked = !!window.__chartsBarPerProvider; } catch(_) {
        // Ignore state restoration errors
      }
      }
    }
    // Show only for Bar
    const el = controls.querySelector('.charts-toggle--suppliers');
    if (el) el.style.display = isBarType() ? 'inline-flex' : 'none';
  } catch(_) {
    // Ignore control initialization errors
  }
}

// Keep visibility in sync on events
subscribe('charts:intervalChanged', () => initProviderStackControl());
subscribe('appState:dataChanged', () => initProviderStackControl());
subscribe('appState:statusChanged', () => initProviderStackControl());
subscribe('appState:uiChanged', () => initProviderStackControl());
// Expose re-init for external calls
try { if (typeof window !== 'undefined') window.__initProviderStackControl = initProviderStackControl; } catch(_) {
  // Ignore global function exposure errors
}
