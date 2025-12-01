// static/js/charts/ui/chartControls.js
// Responsibility: Chart type and interval dropdown controls
import { listTypes } from '../registry.js';
import { publish } from '../../state/eventBus.js';
import { initProviderStackControl } from '../controls/providerStackControl.js';
import { getChartsZoomRange, setChartsCurrentInterval } from '../../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CONTROLS_ID = 'charts-controls';
const MOUNT_ID = 'chart-area-1';
const HOST_ID = 'charts-container';

const TYPE_DROPDOWN_ID = 'chart-type-dropdown';
const INTERVAL_DROPDOWN_ID = 'chart-interval-dropdown';

const DEFAULT_TYPE = 'line';
const DEFAULT_INTERVAL = '1h';
const ACTIVE_COLOR = '#4f86ff';

const DAY_MS = 24 * 3600e3;
const MAX_5M_RANGE_DAYS = 5;

const INTERVAL_ITEMS = [
  { value: '5m', label: '5m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' }
];

// ─────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────

function getMount() {
  return document.getElementById(MOUNT_ID);
}

function getHost() {
  return document.getElementById(HOST_ID);
}

function getControls() {
  return document.getElementById(CONTROLS_ID);
}

function ensureControls() {
  let controls = getControls();
  if (controls) return controls;

  controls = document.createElement('div');
  controls.id = CONTROLS_ID;
  controls.className = 'charts-toolbar';

  const mount = getMount();
  const host = getHost();

  if (mount?.parentNode) {
    mount.parentNode.insertBefore(controls, mount.nextSibling);
  } else if (host) {
    host.appendChild(controls);
  }

  return controls;
}

// ─────────────────────────────────────────────────────────────
// Dropdown creation
// ─────────────────────────────────────────────────────────────

function createDropdownButton(label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'charts-dd__button';
  btn.textContent = label;
  return btn;
}

function createDropdownItem(item, isSelected) {
  const li = document.createElement('li');
  li.className = 'charts-dd__item';
  li.dataset.value = item.value;
  li.textContent = item.label;
  if (isSelected) li.classList.add('is-selected');
  return li;
}

function createDropdown(id, items, selected) {
  const wrap = document.createElement('div');
  wrap.className = 'charts-dd';
  wrap.id = id;

  const selectedItem = items.find(x => x.value === selected) || items[0];
  const btn = createDropdownButton(selectedItem.label);

  const menu = document.createElement('ul');
  menu.className = 'charts-dd__menu';
  items.forEach(item => {
    menu.appendChild(createDropdownItem(item, item.value === selected));
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

// ─────────────────────────────────────────────────────────────
// Dropdown UI updates
// ─────────────────────────────────────────────────────────────

function closeAllDropdowns(root) {
  try {
    root.querySelectorAll('.charts-dd').forEach(dd => dd.classList.remove('is-open'));
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:closeAllDropdowns', e);
  }
}

function updateDropdownSelection(dd, value) {
  try {
    const btn = dd.querySelector('.charts-dd__button');
    const items = Array.from(dd.querySelectorAll('.charts-dd__item'));

    items.forEach(li => li.classList.toggle('is-selected', li.dataset.value === value));

    const selectedItem = items.find(li => li.dataset.value === value);
    if (btn && selectedItem) {
      btn.textContent = selectedItem.textContent;
      btn.style.color = ACTIVE_COLOR;
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:updateDropdownSelection', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Interval validation
// ─────────────────────────────────────────────────────────────

function validateInterval(interval) {
  if (interval !== '5m') return interval;

  const zoomRange = getChartsZoomRange();
  if (!zoomRange || !Number.isFinite(zoomRange.fromTs) || !Number.isFinite(zoomRange.toTs)) {
    return interval;
  }

  const diffDays = (zoomRange.toTs - zoomRange.fromTs) / DAY_MS;
  return diffDays > MAX_5M_RANGE_DAYS ? DEFAULT_INTERVAL : interval;
}

// ─────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────

function handleTypeChange(controls, dd, value) {
  const current = controls.dataset.type || DEFAULT_TYPE;
  if (value === current) return false;

  controls.dataset.type = value || DEFAULT_TYPE;
  updateDropdownSelection(dd, value);

  try {
    initProviderStackControl();
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:initProviderStackControl', e);
  }

  try {
    publish('charts:typeChanged', { type: value || DEFAULT_TYPE });
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:publishTypeChanged', e);
  }

  return true;
}

function handleIntervalChange(controls, dd, value) {
  const current = controls.dataset.interval || DEFAULT_INTERVAL;
  if (value === current) return false;

  const validatedInterval = validateInterval(value || DEFAULT_INTERVAL);

  controls.dataset.interval = validatedInterval;
  setChartsCurrentInterval(validatedInterval);
  updateDropdownSelection(dd, validatedInterval);

  try {
    publish('charts:intervalChanged', { interval: validatedInterval });
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:publishIntervalChanged', e);
  }

  return true;
}

function handleDropdownClick(controls, e) {
  const btn = e.target.closest('.charts-dd__button');
  const item = e.target.closest('.charts-dd__item');

  if (btn) {
    const dd = btn.parentElement;
    const isOpen = dd.classList.contains('is-open');
    closeAllDropdowns(controls);
    if (!isOpen) dd.classList.add('is-open');
    return;
  }

  if (item) {
    const dd = item.closest('.charts-dd');
    const value = String(item.dataset.value || '');

    if (dd?.id === TYPE_DROPDOWN_ID) {
      handleTypeChange(controls, dd, value);
    } else if (dd?.id === INTERVAL_DROPDOWN_ID) {
      handleIntervalChange(controls, dd, value);
    }

    closeAllDropdowns(controls);
  }
}

function bindControls(controls) {
  const onClick = (e) => handleDropdownClick(controls, e);
  controls.addEventListener('click', onClick);
  return () => controls.removeEventListener('click', onClick);
}

// ─────────────────────────────────────────────────────────────
// Type items
// ─────────────────────────────────────────────────────────────

function getTypeItems() {
  let available = listTypes();
  if (!available?.length) available = [DEFAULT_TYPE, 'bar'];

  // filter archived types
  available = available.filter(t => t !== 'stream');

  return available.map(t => ({
    value: t,
    label: t.charAt(0).toUpperCase() + t.slice(1)
  }));
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initChartControls() {
  return initChartTypeDropdown();
}

export function initChartTypeDropdown() {
  const controls = ensureControls();
  const typeItems = getTypeItems();
  const initialInterval = controls.dataset.interval || DEFAULT_INTERVAL;

  controls.innerHTML = '';

  const typeDd = createDropdown(TYPE_DROPDOWN_ID, typeItems, controls.dataset.type || typeItems[0].value);
  const intervalDd = createDropdown(INTERVAL_DROPDOWN_ID, INTERVAL_ITEMS, initialInterval);

  controls.appendChild(typeDd);
  controls.appendChild(intervalDd);

  controls.dataset.interval = initialInterval;
  setChartsCurrentInterval(initialInterval);

  try {
    initProviderStackControl();
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:initProviderStackControl', e);
  }

  const unbind = bindControls(controls);

  return () => {
    try {
      unbind?.();
    } catch (e) {
      logError(ErrorCategory.CHART, 'chartControls:unbind', e);
    }
  };
}

export function setDefaultChartType(type) {
  const controls = ensureControls();
  const defaultType = type || controls.dataset.type || DEFAULT_TYPE;

  controls.dataset.type = defaultType;

  const dd = controls.querySelector(`#${TYPE_DROPDOWN_ID}`);
  if (dd) {
    updateDropdownSelection(dd, defaultType);
  }

  try {
    initProviderStackControl();
  } catch (e) {
    logError(ErrorCategory.CHART, 'chartControls:initProviderStackControl', e);
  }
}
