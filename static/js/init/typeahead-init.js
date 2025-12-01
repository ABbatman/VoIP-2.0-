// static/js/init/typeahead-init.js
// Responsibility: Typeahead initialization for filter inputs
import { attachTypeahead } from '../dom/components/typeahead.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DATALIST_ID = 'ta-block';

const INPUTS = [
  { id: 'customerInput', kind: 'customer', url: '/api/suggest/customer' },
  { id: 'supplierInput', kind: 'supplier', url: '/api/suggest/supplier' },
  { id: 'destinationInput', kind: 'destination', url: '/api/suggest/destination' }
];

// attributes to block browser autofill
const AUTOFILL_BLOCK_ATTRS = {
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: 'false',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-form-type': 'other',
  'x-autocompletetype': 'off',
  'aria-autocomplete': 'none',
  enterkeyhint: 'search',
  inputmode: 'text',
  type: 'text',
  results: '0',
  autosave: 'off'
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2);
}

function ensureEmptyDatalist() {
  if (document.getElementById(DATALIST_ID)) return;

  const dl = document.createElement('datalist');
  dl.id = DATALIST_ID;
  document.body.appendChild(dl);
}

function setAttributes(el, attrs) {
  // use for-in instead of Object.entries().forEach()
  for (const key in attrs) {
    try { el.setAttribute(key, attrs[key]); } catch {}
  }
}

function createDummyPassword(el) {
  const dummy = document.createElement('input');
  dummy.type = 'password';
  dummy.autocomplete = 'new-password';
  dummy.tabIndex = -1;
  Object.assign(dummy.style, { position: 'absolute', left: '-9999px', height: '0' });
  el.parentNode?.insertBefore(dummy, el);
}

function applyNoHistory(el, kind) {
  setAttributes(el, {
    ...AUTOFILL_BLOCK_ATTRS,
    autocomplete: `off-${randomId()}`,
    name: `${kind}_${randomId()}`,
    list: DATALIST_ID
  });

  createDummyPassword(el);

  // refresh on focus to defeat browser history
  el.addEventListener('focus', () => {
    setAttributes(el, {
      autocomplete: `off-${randomId()}`,
      name: `${kind}_${randomId()}`,
      list: DATALIST_ID
    });
  }, true);
}

function initInput({ id, kind, url }) {
  const el = document.getElementById(id);
  if (!el) return;

  applyNoHistory(el, kind);
  attachTypeahead(el, { sourceUrl: url });
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function initTypeaheadFilters() {
  ensureEmptyDatalist();
  // use indexed loop
  const len = INPUTS.length;
  for (let i = 0; i < len; i++) {
    initInput(INPUTS[i]);
  }
}
