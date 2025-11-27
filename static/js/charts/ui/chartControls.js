// static/js/charts/ui/chartControls.js
// chart controls UI (type + interval) and change notifications

import { listTypes } from '../registry.js';
import { publish } from '../../state/eventBus.js';
import { initProviderStackControl } from '../controls/providerStackControl.js';

let onTypeChangeCb = null;

function getMount() { return document.getElementById('chart-area-1'); }

export function initChartControls() {
  return initChartTypeDropdown();
}
function getHost() { return document.getElementById('charts-container'); }

function ensureControls() {
  let controls = document.getElementById('charts-controls');
  const host = getHost();
  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'charts-controls';
    controls.className = 'charts-toolbar';
    const m = getMount();
    if (m && m.parentNode) {
      m.parentNode.insertBefore(controls, m.nextSibling);
    } else if (host) {
      host.appendChild(controls);
    }
  }
  return controls;
}

function makeDd(id, items, selected) {
  const wrap = document.createElement('div');
  wrap.className = 'charts-dd';
  wrap.id = id;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'charts-dd__button';
  btn.textContent = items.find(x => x.value === selected)?.label || items[0].label;
  const menu = document.createElement('ul');
  menu.className = 'charts-dd__menu';
  items.forEach(it => {
    const li = document.createElement('li');
    li.className = 'charts-dd__item';
    li.dataset.value = it.value;
    li.textContent = it.label;
    if (it.value === selected) li.classList.add('is-selected');
    menu.appendChild(li);
  });
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

function closeAllDd(root) {
  try { root.querySelectorAll('.charts-dd').forEach(dd => dd.classList.remove('is-open')); } catch(_) {}
}

function bindControls(controls) {
  const onClick = (e) => {
    const btn = e.target.closest('.charts-dd__button');
    const item = e.target.closest('.charts-dd__item');
    if (btn) {
      const dd = btn.parentElement;
      const open = dd.classList.contains('is-open');
      closeAllDd(controls);
      if (!open) dd.classList.add('is-open');
      return;
    }
    if (item) {
      const dd = item.closest('.charts-dd');
      const value = String(item.dataset.value || '');
      if (dd?.id === 'chart-type-dropdown') {
        const current = controls.dataset.type || 'line';
        if (value === current) { closeAllDd(controls); return; }
        controls.dataset.type = value || 'line';
        // update UI
        try {
          const btn = dd.querySelector('.charts-dd__button');
          const items = Array.from(dd.querySelectorAll('.charts-dd__item'));
          items.forEach(li => li.classList.toggle('is-selected', li.dataset.value === value));
          if (btn) btn.textContent = (items.find(li => li.dataset.value === value)?.textContent) || btn.textContent;
          if (btn) btn.style.color = '#4f86ff';
          dd.classList.remove('is-line','is-bar','is-heatmap','is-hybrid');
        } catch(_) {}
        closeAllDd(controls);
        // update provider toggle visibility
        try { initProviderStackControl(); } catch(_) {}
        // notify
        try { publish('charts:typeChanged', { type: value || 'line' }); } catch(_) {}
        if (typeof onTypeChangeCb === 'function') onTypeChangeCb(value || 'line');
        return;
      }
      if (dd?.id === 'chart-interval-dropdown') {
        const current = controls.dataset.interval || '1h';
        if (value === current) { closeAllDd(controls); return; }
        let next = value || '1h';
        try {
          const zr = (typeof window !== 'undefined') ? window.__chartsZoomRange : null;
          let fromTs, toTs;
          if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
            fromTs = zr.fromTs; toTs = zr.toTs;
          }
          if (next === '5m' && fromTs != null && toTs != null) {
            const diffDays = (toTs - fromTs) / (24 * 3600e3);
            if (diffDays > 5.0001) next = '1h';
          }
        } catch(_) {}
        controls.dataset.interval = next;
        try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = next; } catch(_) {}
        // update UI
        try {
          const btn = dd.querySelector('.charts-dd__button');
          const items = Array.from(dd.querySelectorAll('.charts-dd__item'));
          items.forEach(li => li.classList.toggle('is-selected', li.dataset.value === next));
          if (btn) btn.textContent = (items.find(li => li.dataset.value === next)?.textContent) || btn.textContent;
          if (btn) btn.style.color = '#4f86ff';
          dd.classList.remove('is-5m','is-1h','is-1d');
        } catch(_) {}
        closeAllDd(controls);
        try { publish('charts:intervalChanged', { interval: next }); } catch(_) {}
        return;
      }
    }
  };
  controls.addEventListener('click', onClick);
  return () => controls.removeEventListener('click', onClick);
}

export function initChartTypeDropdown() {
  const controls = ensureControls();
  // types
  let available = listTypes();
  if (!available || available.length === 0) available = ['line', 'bar'];
  // filter out archived stream type
  available = available.filter(t => t !== 'stream');
  const typeItems = available.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
  // interval
  const stepItems = [ { value: '5m', label: '5m' }, { value: '1h', label: '1h' }, { value: '1d', label: '1d' } ];
  const initialInterval = (typeof window !== 'undefined' && window.__chartsCurrentInterval) ? window.__chartsCurrentInterval : (controls.dataset.interval || '1h');

  controls.innerHTML = '';
  const typeDd = makeDd('chart-type-dropdown', typeItems, (controls.dataset.type || typeItems[0].value));
  const stepDd = makeDd('chart-interval-dropdown', stepItems, initialInterval);
  controls.appendChild(typeDd);
  controls.appendChild(stepDd);
  try { controls.dataset.interval = initialInterval; } catch(_) {}
  try { if (typeof window !== 'undefined') window.__chartsCurrentInterval = initialInterval; } catch(_) {}
  try { initProviderStackControl(); } catch(_) {}
  // bind
  const unbind = bindControls(controls);
  return () => { try { unbind && unbind(); } catch(_) {} };
}

export function setDefaultChartType(type) {
  const controls = ensureControls();
  const def = type || (controls.dataset.type || 'line');
  try { controls.dataset.type = def; } catch(_) {}
  try {
    const dd = controls.querySelector('#chart-type-dropdown');
    const btn = dd?.querySelector('.charts-dd__button');
    const items = Array.from(dd?.querySelectorAll('.charts-dd__item') || []);
    items.forEach(li => li.classList.toggle('is-selected', li.dataset.value === def));
    if (btn) btn.textContent = (items.find(li => li.dataset.value === def)?.textContent) || btn.textContent;
    if (btn) btn.style.color = '#4f86ff';
    if (dd) dd.classList.remove('is-line','is-bar','is-heatmap','is-hybrid');
  } catch(_) {}
  try { initProviderStackControl(); } catch(_) {}
}

// onChartTypeChange removed: use charts:typeChanged event instead
