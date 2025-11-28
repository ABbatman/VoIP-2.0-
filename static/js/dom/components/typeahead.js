// static/js/dom/components/typeahead.js
// Lightweight Typeahead for plain JS + Vite
import { logError, ErrorCategory } from "../../utils/errorLogger.js";

const _styleId = "typeahead-inline-styles";

function ensureStylesInjected() {
  if (document.getElementById(_styleId)) return;
  const css = `
  .ta-container { position: relative; }
  .ta-list { position: fixed; z-index: 10000; max-height: 280px; overflow-y: auto; background: #fff; border: 1px solid #d0d7de; border-radius: 6px; box-shadow: 0 8px 24px rgba(140,149,159,0.2); }
  .ta-item { padding: 8px 10px; cursor: pointer; font-size: 14px; line-height: 1.4; }
  .ta-item:hover, .ta-item.ta-active { background: #f6f8fa; }
  .ta-empty { padding: 8px 10px; color: #6e7781; font-size: 13px; }
  `;
  const style = document.createElement('style');
  style.id = _styleId;
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

function debounce(fn, delay) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

function defaultMapItem(item) {
  if (item == null) return { value: "", label: "" };
  if (typeof item === 'string') return { value: item, label: item };
  if (typeof item === 'object') {
    // Try common keys first
    const label = (item.label ?? item.name ?? item.title ?? item.value ?? "");
    const value = (item.value ?? item.id ?? label ?? "");
    return { value: String(value), label: String(label) };
  }
  return { value: String(item), label: String(item) };
}

function createListContainer() {
  const ul = document.createElement('div');
  ul.className = 'ta-list';
  ul.setAttribute('role', 'listbox');
  return ul;
}

function renderItems(container, items, activeIndex, renderer) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ta-empty';
    empty.textContent = 'No results';
    container.appendChild(empty);
    return;
  }
  items.forEach((it, idx) => {
    const el = document.createElement('div');
    el.className = 'ta-item' + (idx === activeIndex ? ' ta-active' : '');
    el.setAttribute('role', 'option');
    if (typeof renderer === 'function') {
      try {
        const content = renderer(it);
        if (content instanceof HTMLElement) {
          el.appendChild(content);
        } else if (content != null) {
          el.innerHTML = String(content);
        } else {
          el.textContent = it.label;
        }
      } catch (e) { logError(ErrorCategory.UI, 'typeahead', e);
        el.textContent = it.label;
      }
    } else {
      el.textContent = it.label;
    }
    el.dataset.value = it.value;
    el.dataset.index = String(idx);
    container.appendChild(el);
  });
}

function positionContainer(inputEl, listEl) {
  // Render popup relative to viewport to avoid clipping
  const r = inputEl.getBoundingClientRect();
  listEl.style.top = (r.bottom + 4) + 'px';
  listEl.style.left = r.left + 'px';
  listEl.style.width = r.width + 'px';
}

export function attachTypeahead(input, options = {}) {
  // Options
  const {
    sourceUrl,           // required: string | (query) => Promise<Array>
    queryParam = 'q',
    minChars = 2,
    debounceMs = 250,
    headers = {},
    mapItem = defaultMapItem,
    renderItem,          // optional custom renderer(item)
    onSelect,            // optional callback({ value, label, raw })
  } = options;

  if (!input || !(input instanceof HTMLElement)) {
    console.warn('attachTypeahead: input element is required');
    return { destroy: () => {} };
  }

  ensureStylesInjected();

  // Wrap input to control positioning without touching outer layout
  let wrapper = input.closest('.ta-container');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'ta-container';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  }

  const listEl = createListContainer();
  // Attach list to body to avoid clipping by parent overflow
  document.body.appendChild(listEl);

  let abortCtrl = null;
  let items = [];
  let activeIndex = -1;
  let open = false;

  const closeList = () => {
    open = false;
    listEl.style.display = 'none';
    activeIndex = -1;
  };
  const openList = () => {
    open = true;
    listEl.style.display = 'block';
    positionContainer(input, listEl);
  };

  const fetchItems = async (q) => {
    if (!sourceUrl) return [];
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const url = typeof sourceUrl === 'function' ? sourceUrl(q) : `${sourceUrl}?${encodeURIComponent(queryParam)}=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { headers, signal: abortCtrl.signal });
    if (!resp.ok) return [];
    let data = await resp.json().catch(() => []);
    if (!Array.isArray(data)) {
      // Try known shapes: { items: [...] } or { results: [...] }
      if (Array.isArray(data.items)) data = data.items;
      else if (Array.isArray(data.results)) data = data.results;
      else data = [];
    }
    return data.map((x) => ({ ...mapItem(x), raw: x }));
  };

  const doQuery = async (q) => {
    if (q.length < minChars) { closeList(); return; }
    try {
      items = await fetchItems(q);
      // Debug: show count
      try { console.debug('[typeahead] results:', items.length); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
        // Ignore debug logging errors
      }
      // Always show the dropdown; render "No results" when empty
      renderItems(listEl, items, activeIndex, renderItem);
      openList();
    } catch (e) {
      // Silently ignore fetch errors
      try { console.debug('[typeahead] fetch error'); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
        // Ignore debug logging errors
      }
      closeList();
    }
  };

  const debouncedQuery = debounce((val) => doQuery(val), debounceMs);

  const onInput = (e) => {
    const val = e.target.value || '';
    debouncedQuery(val.trim());
  };

  const commitSelection = (index) => {
    if (index < 0 || index >= items.length) return;
    const chosen = items[index];
    input.value = chosen.label;
    closeList();
    if (typeof onSelect === 'function') {
      try { onSelect(chosen); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
        // Ignore callback errors
      }
    }
  };

  const onKeydown = (e) => {
    if (!open) return;
    const max = items.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(max, activeIndex + 1);
      renderItems(listEl, items, activeIndex, renderItem);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      renderItems(listEl, items, activeIndex, renderItem);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) commitSelection(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
    }
  };

  const onClickItem = (e) => {
    const itemEl = e.target.closest('.ta-item');
    if (!itemEl) return;
    const idx = Number(itemEl.dataset.index || -1);
    commitSelection(idx);
  };

  const onDocumentClick = (e) => {
    if (!open) return;
    if (e.target === input) return;
    if (wrapper.contains(e.target)) return; // clicks inside keep it
    closeList();
  };

  // Events
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  listEl.addEventListener('click', onClickItem);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', () => positionContainer(input, listEl));
  window.addEventListener('scroll', () => positionContainer(input, listEl), true);

  // Public destroy
  const destroy = () => {
    try { input.removeEventListener('input', onInput); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
    try { input.removeEventListener('keydown', onKeydown); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
    try { listEl.removeEventListener('click', onClickItem); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
    try { document.removeEventListener('click', onDocumentClick); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
    try { window.removeEventListener('resize', () => positionContainer(input, listEl)); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
    try { window.removeEventListener('scroll', () => positionContainer(input, listEl), true); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
    try { listEl.remove(); } catch(e) { logError(ErrorCategory.UI, 'typeahead', e);
      // Ignore cleanup errors
    }
  };

  return { destroy };
}

// Optional helper: init by data attributes (won't auto-run; import and call explicitly)
// data-typeahead="/api/suggest/customer" data-query-param="q" data-min-chars="2" data-debounce="250"
export function initTypeaheadByDataAttr(root = document) {
  ensureStylesInjected();
  const inputs = root.querySelectorAll('[data-typeahead]');
  inputs.forEach((inp) => {
    const sourceUrl = inp.getAttribute('data-typeahead');
    const queryParam = inp.getAttribute('data-query-param') || 'q';
    const minChars = Number(inp.getAttribute('data-min-chars') || 2);
    const debounceMs = Number(inp.getAttribute('data-debounce') || 250);
    attachTypeahead(inp, { sourceUrl, queryParam, minChars, debounceMs });
  });
}
