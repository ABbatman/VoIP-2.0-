// static/js/virtual/virtual-scroller.js
// Responsibility: Virtual scrolling calculations and DOM manipulation

import { getVirtualConfig } from '../config/virtual-config.js';
import { computeVisibleRange } from './scroller/viewport.js';
import { ensurePool, trimPool, detachExtraRows } from './scroller/pool.js';
import { applyRowDiff } from './scroller/diff.js';
import { recomputeRowHeight } from './scroller/measurement.js';
import { maybeNotifyDomUpdate } from './scroller/dom-callbacks.js';
import { patchRowAt, patchRowsRange } from './scroller/patch.js';
import { applyOptimizedConfig } from './scroller/config-adapter.js';
import { getStatus as getScrollerStatus } from './scroller/status.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MEASURE_INTERVAL = 5;
const DOM_UPDATE_INTERVAL = 3;
const POOL_SCREENS_CAP = 4;

const ROW_CLASSES = { main: 'main-row', peer: 'peer-row', hourly: 'hour-row' };

function getRowClass(rowData) {
  if (rowData.level === 0 || rowData.type === 'main') return ROW_CLASSES.main;
  if (rowData.level === 1 || rowData.type === 'peer') return ROW_CLASSES.peer;
  if (rowData.level === 2 || rowData.type === 'hourly') return ROW_CLASSES.hourly;
  return '';
}

// ─────────────────────────────────────────────────────────────
// Class
// ─────────────────────────────────────────────────────────────

export class VirtualScroller {
  constructor(options = {}) {
    const config = getVirtualConfig();

    this.container = options.container;
    this.spacer = options.spacer;
    this.tbody = options.tbody;
    this.table = options.table;

    this.rowHeight = options.rowHeight || config.ROW_HEIGHT;
    this.bufferSize = options.bufferSize || config.BUFFER_SIZE;
    this.scrollThrottle = options.scrollThrottle || config.SCROLL_THROTTLE_MS;

    this.data = [];
    this.renderRowFn = options.renderRow;
    this.onDOMUpdate = options.onDOMUpdate;
    this.isInitialized = false;
    this.scrollTimeout = null;
    this.usesPageScroll = false;

    // internal state
    this._rafScheduled = false;
    this._rowPool = [];
    this._renderSinceMeasure = 0;
    this._measureEvery = MEASURE_INTERVAL;
    this._lastOffsetTop = -1;
    this._lastScrollTop = 0;
    this._lastScrollTs = 0;
    this._bufferMultiplier = 1;
    this._scratchTbody = null;
    this._domTick = 0;
    this._domEvery = DOM_UPDATE_INTERVAL;
    this._poolScreensCap = POOL_SCREENS_CAP;
  }

  // ─────────────────────────────────────────────────────────────
  // Initialize
  // ─────────────────────────────────────────────────────────────

  initialize() {
    if (!this.container || !this.spacer || !this.tbody || !this.table) {
      logError(ErrorCategory.SCROLL, 'vs:init', 'Missing required DOM elements');
      return false;
    }

    this._onScroll = this._onScroll.bind(this);
    this.container.addEventListener('scroll', this._onScroll, { passive: true });

    this.usesPageScroll = this.container.scrollHeight <= this.container.clientHeight;
    if (this.usesPageScroll) {
      this._onWindowScroll = this._onWindowScroll.bind(this);
      window.addEventListener('scroll', this._onWindowScroll, { passive: true });
    }

    this.isInitialized = true;

    if (this.tbody?.style) {
      this.tbody.style.willChange = 'transform';
      try { this.tbody.style.contain = 'content'; } catch (e) { /* unsupported */ }
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // Data management
  // ─────────────────────────────────────────────────────────────

  setData(data) {
    this.data = data;
    applyOptimizedConfig(this, data.length);
    this.spacer.style.height = `${data.length * this.rowHeight}px`;

    if (this.tbody) this.tbody.innerHTML = '';

    if (!data.length) {
      this.spacer.style.height = '0px';
      maybeNotifyDomUpdate(this, { forceRender: true, structuralChange: true });
      return;
    }

    this.lastStartIndex = undefined;
    this.lastEndIndex = undefined;
    this.render(true);
    recomputeRowHeight(this);
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  render(forceRender = false) {
    if (!this.isInitialized) return;

    if (!this.data.length) {
      if (this.tbody) this.tbody.innerHTML = '';
      this.spacer.style.height = '0px';
      maybeNotifyDomUpdate(this, { forceRender: true, structuralChange: true });
      return;
    }

    const vr = computeVisibleRange({
      container: this.container,
      usesPageScroll: this.usesPageScroll,
      rowHeight: this.rowHeight,
      baseBufferSize: this.bufferSize,
      lastStartIndex: this.lastStartIndex,
      lastEndIndex: this.lastEndIndex,
      forceRender,
      lastScrollTop: this._lastScrollTop,
      lastScrollTs: this._lastScrollTs
    });

    this._bufferMultiplier = vr.bufferMultiplier;

    if (vr.shouldSkip) {
      this._lastScrollTop = vr.scrollTop;
      this._lastScrollTs = vr.nowTs;
      return;
    }

    const startIndex = vr.startIndex;
    const endIndex = Math.min(this.data.length, vr.endIndex);
    this.lastStartIndex = startIndex;
    this.lastEndIndex = endIndex;

    // Direct indexed access instead of slice — avoids array allocation
    const needCount = endIndex - startIndex;

    ensurePool(this._rowPool, needCount);

    // update rows
    const attachFrag = document.createDocumentFragment();
    let attachCount = 0;

    for (let i = 0; i < needCount; i++) {
      const tr = this._rowPool[i];
      const rowData = this.data[startIndex + i]; // direct access instead of slice
      const needsAttach = tr.parentNode !== this.tbody;

      const cls = getRowClass(rowData);
      if (tr.className !== cls) tr.className = cls;

      if (!tr._roleSet) { tr.setAttribute('role', 'row'); tr._roleSet = true; }

      const key = rowData.groupId || `${rowData.type || 'row'}-${startIndex + i}`;
      if (tr.dataset.key !== key) tr.dataset.key = key;

      const idx = String(startIndex + i);
      if (tr.dataset.virtualIndex !== idx) tr.dataset.virtualIndex = idx;

      const group = rowData.parentId || '';
      if (tr.dataset.group !== group) tr.dataset.group = group;

      const html = this.renderRowFn?.(rowData) ?? this.defaultRowRenderer(rowData);
      this._scratchTbody = applyRowDiff(tr, html, this._scratchTbody);
      tr._lastOffsetTop = undefined;

      if (needsAttach) { attachFrag.appendChild(tr); attachCount++; }
    }

    if (attachFrag.childNodes.length) this.tbody.appendChild(attachFrag);

    const detachCount = detachExtraRows(this._rowPool, this.tbody, needCount);

    // trim pool
    const maxPool = Math.max(needCount, Math.ceil(vr.visibleRowsCount * this._poolScreensCap));
    if (this._rowPool.length > maxPool) trimPool(this._rowPool, maxPool, needCount, this.tbody);

    // measure row height periodically
    if (!getVirtualConfig().FIXED_ROW_HEIGHT) {
      this._renderSinceMeasure = (this._renderSinceMeasure || 0) + 1;
      if (this._renderSinceMeasure >= this._measureEvery) {
        this._renderSinceMeasure = 0;
        const sample = this._rowPool[0] || this.tbody.querySelector('tr');
        if (sample) {
          const h = Math.round(sample.getBoundingClientRect().height);
          if (h && h !== this.rowHeight) this.rowHeight = h;
        }
      }
    }

    maybeNotifyDomUpdate(this, { forceRender, structuralChange: attachCount > 0 || detachCount > 0 });

    // update spacer
    const visibleCount = endIndex - startIndex;
    const total = Math.max(this.data.length * this.rowHeight, startIndex * this.rowHeight + visibleCount * this.rowHeight);
    const key = `${this.data.length}|${this.rowHeight}|${startIndex}|${endIndex}`;
    if (this._lastSpacerKey !== key) {
      this.spacer.style.height = `${total}px`;
      this._lastSpacerKey = key;
    }

    // position tbody
    const offsetTop = startIndex * this.rowHeight;
    if (this._lastOffsetTop !== offsetTop) {
      this.tbody.style.transform = `translate3d(0, ${offsetTop}px, 0)`;
      this._lastOffsetTop = offsetTop;
    }

    this.renderCount = (this.renderCount || 0) + 1;
    this._lastScrollTop = vr.scrollTop;
    this._lastScrollTs = vr.nowTs;
  }

  recomputeRowHeight() { recomputeRowHeight(this); }

  defaultRowRenderer(r) {
    return [
      `<td>${r.main || ''}</td>`,
      `<td>${r.peer || ''}</td>`,
      `<td>${r.destination || ''}</td>`,
      `<td>${r.Min || 0}</td>`,
      `<td>${r.TCall || 0}</td>`,
      `<td>${r.SCall || 0}</td>`,
      `<td>${r.ASR || 0}</td>`,
      `<td>${r.ACD || 0}</td>`,
      `<td>${r.PDD || 0}</td>`,
      `<td>${r.ATime || 0}</td>`
    ].join('');
  }

  getStatus() { return getScrollerStatus(this); }

  // ─────────────────────────────────────────────────────────────
  // Scroll handling
  // ─────────────────────────────────────────────────────────────

  scrollToIndex(index, align = 'start') {
    if (!Number.isFinite(index) || index < 0) return;

    const clamped = Math.min(index, Math.max(0, this.data.length - 1));
    let offset = clamped * this.rowHeight;
    const h = this.container.clientHeight;

    if (align === 'center') offset = Math.max(0, offset - Math.floor(h / 2));
    else if (align === 'end') offset = Math.max(0, offset - Math.max(0, h - this.rowHeight));

    if (this.usesPageScroll) {
      window.scrollTo({ top: this.container.getBoundingClientRect().top + window.scrollY + offset, behavior: 'auto' });
    } else {
      this.container.scrollTop = offset;
    }
    this.render(true);
  }

  updateRowAt(index, newRowData) {
    if (newRowData) this.data[index] = newRowData;
    patchRowAt(this, index);
  }

  updateRows(rangeStart, rowsArray, options = {}) {
    patchRowsRange(this, rangeStart, rowsArray, options);
  }

  throttledRender() {
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => this.render(), this.scrollThrottle);
  }

  _onScroll() {
    if (this._rafScheduled) return;
    this._rafScheduled = true;
    requestAnimationFrame(() => {
      this._rafScheduled = false;
      this.render();
    });
  }

  _onWindowScroll() { this._onScroll(); }

  // ─────────────────────────────────────────────────────────────
  // Destroy
  // ─────────────────────────────────────────────────────────────

  destroy() {
    this.container?.removeEventListener('scroll', this._onScroll);
    if (this._onWindowScroll) window.removeEventListener('scroll', this._onWindowScroll);
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.isInitialized = false;
  }
}
