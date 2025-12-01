// static/js/charts/controls/providerStackControl.js
// Responsibility: Suppliers toggle checkbox for bar chart
import { subscribe, publish } from '../../state/eventBus.js';
import { logError, ErrorCategory } from '../../utils/errorLogger.js';
import { isChartsBarPerProvider, setChartsBarPerProvider } from '../../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TOGGLE_CLASS = 'charts-toggle--suppliers';
const CONTROLS_ID = 'charts-controls';

const WRAPPER_STYLES = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  marginLeft: '12px',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid rgba(0,0,0,0.08)',
  background: 'rgba(0,0,0,0.02)'
};

const LABEL_STYLES = {
  fontSize: '12px',
  fontWeight: '600',
  color: '#6e7781'
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeCall(fn) {
  try {
    return fn();
  } catch (e) {
    logError(ErrorCategory.CHART, 'providerStackControl', e);
    return null;
  }
}

function applyStyles(el, styles) {
  Object.assign(el.style, styles);
}

function getControlsContainer() {
  return document.getElementById(CONTROLS_ID);
}

function isBarChartType() {
  const controls = getControlsContainer();
  return controls?.dataset?.type === 'bar';
}

// ─────────────────────────────────────────────────────────────
// DOM creation
// ─────────────────────────────────────────────────────────────

function createCheckboxInput() {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'charts-bar-per-provider';
  input.className = 'charts-toggle__input';
  safeCall(() => { input.style.accentColor = '#4f86ff'; });
  return input;
}

function createLabel() {
  const span = document.createElement('span');
  span.textContent = 'Suppliers';
  span.className = 'charts-toggle__label';
  applyStyles(span, LABEL_STYLES);
  return span;
}

function createSupplierToggle() {
  const wrapper = document.createElement('label');
  wrapper.className = `charts-toggle ${TOGGLE_CLASS}`;
  applyStyles(wrapper, WRAPPER_STYLES);

  const input = createCheckboxInput();
  const label = createLabel();

  wrapper.appendChild(input);
  wrapper.appendChild(label);

  return { wrapper, input };
}

// ─────────────────────────────────────────────────────────────
// Event handling
// ─────────────────────────────────────────────────────────────

function handleToggleChange(input) {
  const checked = !!input.checked;
  safeCall(() => setChartsBarPerProvider(checked));
  safeCall(() => publish('charts:bar:perProviderChanged', { perProvider: checked }));
}

function syncCheckboxState(input) {
  safeCall(() => { input.checked = isChartsBarPerProvider(); });
}

function updateVisibility(element) {
  if (element) {
    element.style.display = isBarChartType() ? 'inline-flex' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────
// Main init
// ─────────────────────────────────────────────────────────────

export function initProviderStackControl() {
  safeCall(() => {
    const controls = getControlsContainer();
    if (!controls) return;

    let toggle = controls.querySelector(`.${TOGGLE_CLASS}`);

    if (!toggle) {
      // create new toggle
      const { wrapper, input } = createSupplierToggle();
      controls.appendChild(wrapper);
      syncCheckboxState(input);
      input.addEventListener('change', () => handleToggleChange(input));
      toggle = wrapper;
    } else {
      // sync existing toggle
      const input = toggle.querySelector('input');
      if (input) syncCheckboxState(input);
    }

    updateVisibility(toggle);
  });
}

// ─────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────

const SYNC_EVENTS = [
  'charts:intervalChanged',
  'appState:dataChanged',
  'appState:statusChanged',
  'appState:uiChanged'
];

SYNC_EVENTS.forEach(event => subscribe(event, initProviderStackControl));

// expose for external calls
safeCall(() => {
  if (typeof window !== 'undefined') {
    window.__initProviderStackControl = initProviderStackControl;
  }
});
