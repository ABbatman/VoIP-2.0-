// static/js/init/typeahead-init.js
// Init Typeahead for Customer/Supplier/Destination and block native suggestions

import { attachTypeahead } from '../dom/components/typeahead.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

function ensureEmptyDatalist() {
  let dl = document.getElementById('ta-block');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'ta-block';
    document.body.appendChild(dl);
  }
  return dl;
}

function applyNoHistory(el, kind) {
  // Strongly discourage browser autofill/history
  const rand = Math.random().toString(36).slice(2);
  el.setAttribute('autocomplete', `off-${rand}`);
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('data-1p-ignore', 'true');
  el.setAttribute('data-lpignore', 'true');
  el.setAttribute('data-form-type', 'other');
  el.setAttribute('x-autocompletetype', 'off');
  el.setAttribute('aria-autocomplete', 'none');
  el.setAttribute('enterkeyhint', 'search');
  el.setAttribute('inputmode', 'text');
  try { el.setAttribute('type', 'text'); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
  el.setAttribute('results', '0');
  el.setAttribute('autosave', 'off');
  try { el.setAttribute('name', `${kind}_` + Math.random().toString(36).slice(2)); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }

  // Dummy password to absorb autofill
  try {
    const dummy = document.createElement('input');
    dummy.type = 'password';
    dummy.autocomplete = 'new-password';
    dummy.tabIndex = -1;
    dummy.style.position = 'absolute';
    dummy.style.left = '-9999px';
    dummy.style.height = '0';
    el.parentNode.insertBefore(dummy, el);
  } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }

  // Do NOT toggle readOnly; keep inputs fully editable to preserve caret and deletion behavior
  // Additionally, re-randomize attributes on every focus to defeat history/autofill
  try {
    const refreshAttrs = () => {
      const r = Math.random().toString(36).slice(2);
      el.setAttribute('autocomplete', `off-${r}`);
      try { el.setAttribute('name', `${kind}_` + Math.random().toString(36).slice(2)); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
      try { el.setAttribute('list', 'ta-block'); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
    };
    el.addEventListener('focus', refreshAttrs, true);
  } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
}

export function initTypeaheadFilters() {
  ensureEmptyDatalist();

  const ci = document.getElementById('customerInput');
  if (ci) {
    applyNoHistory(ci, 'customer');
    try { ci.setAttribute('list', 'ta-block'); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
    attachTypeahead(ci, { sourceUrl: '/api/suggest/customer' });
  }

  const si = document.getElementById('supplierInput');
  if (si) {
    applyNoHistory(si, 'supplier');
    try { si.setAttribute('list', 'ta-block'); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
    attachTypeahead(si, { sourceUrl: '/api/suggest/supplier' });
  }

  const di = document.getElementById('destinationInput');
  if (di) {
    applyNoHistory(di, 'destination');
    try { di.setAttribute('list', 'ta-block'); } catch (e) { logError(ErrorCategory.INIT, 'typeaheadInit', e);
      // Ignore typeahead init errors
    }
    attachTypeahead(di, { sourceUrl: '/api/suggest/destination' });
  }
}
