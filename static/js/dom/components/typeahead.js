// static/js/dom/components/typeahead.js
// Responsibility: Lightweight typeahead/autocomplete component
import { logError, ErrorCategory } from '../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STYLE_ID = 'typeahead-inline-styles';
const POPUP_OFFSET = 4;

const STYLES = `
.ta-container { position: relative; }
.ta-list { position: fixed; z-index: 10000; max-height: 280px; overflow-y: auto; background: #fff; border: 1px solid #d0d7de; border-radius: 6px; box-shadow: 0 8px 24px rgba(140,149,159,0.2); }
.ta-item { padding: 8px 10px; cursor: pointer; font-size: 14px; line-height: 1.4; }
.ta-item:hover, .ta-item.ta-active { background: #f6f8fa; }
.ta-empty { padding: 8px 10px; color: #6e7781; font-size: 13px; }
`;

// ─────────────────────────────────────────────────────────────
// Styles injection
// ─────────────────────────────────────────────────────────────

function ensureStylesInjected() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.type = 'text/css';
  style.appendChild(document.createTextNode(STYLES));
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function safeCall(fn, context = 'typeahead') {
  try {
    fn();
  } catch (e) {
    logError(ErrorCategory.UI, context, e);
  }
}

// ─────────────────────────────────────────────────────────────
// Item mapping
// ─────────────────────────────────────────────────────────────

function defaultMapItem(item) {
  if (item == null) return { value: '', label: '' };
  if (typeof item === 'string') return { value: item, label: item };

  if (typeof item === 'object') {
    const label = item.label ?? item.name ?? item.title ?? item.value ?? '';
    const value = item.value ?? item.id ?? label ?? '';
    return { value: String(value), label: String(label) };
  }

  return { value: String(item), label: String(item) };
}

// ─────────────────────────────────────────────────────────────
// DOM creation
// ─────────────────────────────────────────────────────────────

function createListContainer() {
  const el = document.createElement('div');
  el.className = 'ta-list';
  el.setAttribute('role', 'listbox');
  return el;
}

function createEmptyMessage() {
  const el = document.createElement('div');
  el.className = 'ta-empty';
  el.textContent = 'No results';
  return el;
}

function createItemElement(item, index, isActive, renderer) {
  const el = document.createElement('div');
  el.className = 'ta-item' + (isActive ? ' ta-active' : '');
  el.setAttribute('role', 'option');
  el.dataset.value = item.value;
  el.dataset.index = String(index);

  if (typeof renderer === 'function') {
    safeCall(() => {
      const content = renderer(item);
      if (content instanceof HTMLElement) {
        el.appendChild(content);
      } else if (content != null) {
        el.innerHTML = String(content);
      } else {
        el.textContent = item.label;
      }
    });
    if (!el.hasChildNodes()) el.textContent = item.label;
  } else {
    el.textContent = item.label;
  }

  return el;
}

// ─────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────

function renderItems(container, items, activeIndex, renderer) {
  container.innerHTML = '';

  if (!items?.length) {
    container.appendChild(createEmptyMessage());
    return;
  }

  items.forEach((item, idx) => {
    container.appendChild(createItemElement(item, idx, idx === activeIndex, renderer));
  });
}

function positionContainer(inputEl, listEl) {
  const rect = inputEl.getBoundingClientRect();
  listEl.style.top = `${rect.bottom + POPUP_OFFSET}px`;
  listEl.style.left = `${rect.left}px`;
  listEl.style.width = `${rect.width}px`;
}

// ─────────────────────────────────────────────────────────────
// Wrapper setup
// ─────────────────────────────────────────────────────────────

function ensureWrapper(input) {
  let wrapper = input.closest('.ta-container');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'ta-container';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  }
  return wrapper;
}

// ─────────────────────────────────────────────────────────────
// Fetch logic
// ─────────────────────────────────────────────────────────────

function buildFetchUrl(sourceUrl, query, queryParam) {
  if (typeof sourceUrl === 'function') return sourceUrl(query);
  return `${sourceUrl}?${encodeURIComponent(queryParam)}=${encodeURIComponent(query)}`;
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

// ─────────────────────────────────────────────────────────────
// Main attach function
// ─────────────────────────────────────────────────────────────

export function attachTypeahead(input, options = {}) {
  const {
    sourceUrl,
    queryParam = 'q',
    minChars = 2,
    debounceMs = 250,
    headers = {},
    mapItem = defaultMapItem,
    renderItem,
    onSelect
  } = options;

  if (!input || !(input instanceof HTMLElement)) {
    return { destroy: () => {} };
  }

  ensureStylesInjected();

  const wrapper = ensureWrapper(input);
  const listEl = createListContainer();
  document.body.appendChild(listEl);

  // state
  let abortCtrl = null;
  let items = [];
  let activeIndex = -1;
  let isOpen = false;

  // list visibility
  const closeList = () => {
    isOpen = false;
    listEl.style.display = 'none';
    activeIndex = -1;
  };

  const openList = () => {
    isOpen = true;
    listEl.style.display = 'block';
    positionContainer(input, listEl);
  };

  // fetch
  const fetchItems = async (query) => {
    if (!sourceUrl) return [];

    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    const url = buildFetchUrl(sourceUrl, query, queryParam);
    const resp = await fetch(url, { headers, signal: abortCtrl.signal });

    if (!resp.ok) return [];

    const data = await resp.json().catch(() => []);
    return extractArray(data).map(x => ({ ...mapItem(x), raw: x }));
  };

  const doQuery = async (query) => {
    if (query.length < minChars) {
      closeList();
      return;
    }

    try {
      items = await fetchItems(query);
      renderItems(listEl, items, activeIndex, renderItem);
      openList();
    } catch {
      closeList();
    }
  };

  const debouncedQuery = debounce(doQuery, debounceMs);

  const commitSelection = (index) => {
    if (index < 0 || index >= items.length) return;

    const chosen = items[index];
    input.value = chosen.label;
    closeList();

    if (typeof onSelect === 'function') {
      safeCall(() => onSelect(chosen));
    }
  };

  // event handlers
  const handleInput = (e) => {
    debouncedQuery((e.target.value || '').trim());
  };

  const handleKeydown = (e) => {
    if (!isOpen) return;

    const maxIdx = items.length - 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = Math.min(maxIdx, activeIndex + 1);
        renderItems(listEl, items, activeIndex, renderItem);
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = Math.max(0, activeIndex - 1);
        renderItems(listEl, items, activeIndex, renderItem);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) commitSelection(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        closeList();
        break;
    }
  };

  const handleItemClick = (e) => {
    const itemEl = e.target.closest('.ta-item');
    if (!itemEl) return;
    commitSelection(Number(itemEl.dataset.index ?? -1));
  };

  const handleDocumentClick = (e) => {
    if (!isOpen) return;
    if (e.target === input || wrapper.contains(e.target)) return;
    closeList();
  };

  const handleReposition = () => positionContainer(input, listEl);

  // attach events
  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeydown);
  listEl.addEventListener('click', handleItemClick);
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('resize', handleReposition);
  window.addEventListener('scroll', handleReposition, true);

  // cleanup
  const destroy = () => {
    safeCall(() => input.removeEventListener('input', handleInput));
    safeCall(() => input.removeEventListener('keydown', handleKeydown));
    safeCall(() => listEl.removeEventListener('click', handleItemClick));
    safeCall(() => document.removeEventListener('click', handleDocumentClick));
    safeCall(() => window.removeEventListener('resize', handleReposition));
    safeCall(() => window.removeEventListener('scroll', handleReposition, true));
    safeCall(() => listEl.remove());
  };

  return { destroy };
}

// ─────────────────────────────────────────────────────────────
// Data attribute initialization
// ─────────────────────────────────────────────────────────────

export function initTypeaheadByDataAttr(root = document) {
  ensureStylesInjected();

  root.querySelectorAll('[data-typeahead]').forEach(inp => {
    attachTypeahead(inp, {
      sourceUrl: inp.getAttribute('data-typeahead'),
      queryParam: inp.getAttribute('data-query-param') || 'q',
      minChars: Number(inp.getAttribute('data-min-chars') || 2),
      debounceMs: Number(inp.getAttribute('data-debounce') || 250)
    });
  });
}
