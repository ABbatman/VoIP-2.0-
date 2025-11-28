// Virtual Scroller Module - Single Responsibility: Virtual Scrolling Logic
// Localized comments in English as requested

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

/**
 * Simple Virtual Scroller implementation
 * Responsibility: Handle virtual scrolling calculations and DOM manipulation
 */
export class VirtualScroller {
  constructor(options = {}) {
    this.container = options.container;
    this.spacer = options.spacer;
    this.tbody = options.tbody;
    this.table = options.table;
    
    // Use configuration-based settings
    const config = getVirtualConfig();
    this.rowHeight = options.rowHeight || config.ROW_HEIGHT;
    this.bufferSize = options.bufferSize || config.BUFFER_SIZE;
    this.scrollThrottle = options.scrollThrottle || config.SCROLL_THROTTLE_MS;
    
    this.data = [];
    this.renderRowFn = options.renderRow;
    this.onDOMUpdate = options.onDOMUpdate; // ✅ Set DOM update callback from options
    this.isInitialized = false;
    this.scrollTimeout = null;
    // Smooth scrolling via requestAnimationFrame
    this._rafScheduled = false;
    this._onScroll = this._onScroll ? this._onScroll.bind(this) : null;
    this._onWindowScroll = this._onWindowScroll ? this._onWindowScroll.bind(this) : null;
    this.usesPageScroll = false;
    // Simple TR recycling pool
    this._rowPool = [];
    // Debounced row height measurement
    this._renderSinceMeasure = 0;
    this._measureEvery = 5; // measure every N renders to avoid layout thrash
    // Cache last offset to avoid redundant transform writes
    this._lastOffsetTop = -1;
    // Scroll speed tracking for dynamic buffering
    this._lastScrollTop = 0;
    this._lastScrollTs = 0;
    this._bufferMultiplier = 1;
    // Scratch container for partial cell diffs
    this._scratchTbody = null;
    // Soft throttling for DOM update callback
    this._domTick = 0;
    this._domEvery = 3; // call onDOMUpdate every N renders unless structural changes
    // Cap for row pool size in number of viewport screens (tunable)
    this._poolScreensCap = 4;
  }

  /**
   * Initialize the virtual scroller with DOM elements
   */
  initialize() {
    if (!this.container || !this.spacer || !this.tbody || !this.table) {
      console.warn('Virtual Scroller: Missing required DOM elements');
      return false;
    }

    // Add passive scroll listener and render via requestAnimationFrame for smoothness
    this._onScroll = this._onScroll.bind(this);
    this.container.addEventListener('scroll', this._onScroll, { passive: true });
    // Detect whether container has its own vertical scroll; if not, fall back to window scroll
    // More robust than relying on computed overflow styles
    this.usesPageScroll = (this.container.scrollHeight <= this.container.clientHeight);
    if (this.usesPageScroll) {
      this._onWindowScroll = this._onWindowScroll.bind(this);
      window.addEventListener('scroll', this._onWindowScroll, { passive: true });
    }
    this.isInitialized = true;
    // Hint browser for smoother compositing (on tbody so thead can be sticky)
    if (this.tbody && this.tbody.style) {
      this.tbody.style.willChange = 'transform';
      // Isolate layout/paint for tbody to improve performance on large tables
      try { this.tbody.style.contain = 'content'; } catch (e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e); /* ignore if unsupported */ }
    }
    return true;
  }

  /**
   * Set data for virtual scrolling
   */
  setData(data) {
    this.data = data;
    
    // Use optimized configuration based on data size
    applyOptimizedConfig(this, data.length);
    
    // Set spacer height for proper scrollbar
    const totalHeight = this.data.length * this.rowHeight;
    this.spacer.style.height = `${totalHeight}px`;

    // Hard clear tbody to remove any legacy/non-pooled rows from previous render modes
    try { if (this.tbody) this.tbody.innerHTML = ''; } catch (e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore tbody clear errors
    }

    // If no data, immediately clear tbody so old rows don't remain visible
    if (!this.data.length) {
      if (this.tbody) this.tbody.innerHTML = '';
      this.spacer.style.height = '0px';
      try { maybeNotifyDomUpdate(this, { forceRender: true, structuralChange: true }); } catch(e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore virtual scroller errors
    }
      return true;
    }
    
    // Reset indices so next render is not skipped, and force re-render
    this.lastStartIndex = undefined;
    this.lastEndIndex = undefined;
    this.render(true);

    // After first render, measure real row height (accounts for borders) and correct spacer
    try { recomputeRowHeight(this); } catch(e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore virtual scroller errors
    }
  }

  /**
   * Render visible rows based on scroll position (ultra-lazy)
   */
  render(forceRender = false) {
    if (!this.isInitialized) return;
    // If no data, clear tbody/spacer and exit
    if (!this.data.length) {
      if (this.tbody) this.tbody.innerHTML = '';
      this.spacer.style.height = '0px';
      try { maybeNotifyDomUpdate(this, { forceRender: true, structuralChange: true }); } catch(e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore virtual scroller errors
    }
      return;
    }

    // Start performance timing
    const __tRenderStart = performance.now();
    let __tDiffMs = 0;

    // Compute visible window using extracted helper
    const vr = computeVisibleRange({
      container: this.container,
      usesPageScroll: this.usesPageScroll,
      rowHeight: this.rowHeight,
      baseBufferSize: this.bufferSize,
      lastStartIndex: this.lastStartIndex,
      lastEndIndex: this.lastEndIndex,
      forceRender,
      lastScrollTop: this._lastScrollTop,
      lastScrollTs: this._lastScrollTs,
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
    
    // Get visible data slice (ultra-lazy)
    const visibleData = this.data.slice(startIndex, endIndex);
    
    // Ensure pool has enough rows (create only when needed). Do not shrink pool; detach extra rows.
    const needCount = visibleData.length;
    ensurePool(this._rowPool, needCount);

    // Attach needed rows and update in place (batched)
    const attachFrag = document.createDocumentFragment();
    let _attachCount = 0;
    for (let i = 0; i < needCount; i++) {
      const tr = this._rowPool[i];
      const needsAttach = (tr.parentNode !== this.tbody);
      const rowData = visibleData[i];
      // Compute desired class
      let desiredClass = '';
      if (rowData.level === 0 || rowData.type === 'main') desiredClass = 'main-row';
      else if (rowData.level === 1 || rowData.type === 'peer') desiredClass = 'peer-row';
      else if (rowData.level === 2 || rowData.type === 'hourly') desiredClass = 'hour-row';
      if (tr.className !== desiredClass) tr.className = desiredClass;
      // Accessibility and stable key (set once)
      if (!tr._roleSet) { tr.setAttribute('role', 'row'); tr._roleSet = true; }
      const desiredKey = rowData.groupId || `${rowData.type || 'row'}-${startIndex + i}`;
      if (tr.dataset.key !== desiredKey) tr.dataset.key = desiredKey;
      const desiredIndex = String(startIndex + i);
      if (tr.dataset.virtualIndex !== desiredIndex) tr.dataset.virtualIndex = desiredIndex;
      const desiredGroup = rowData.parentId || '';
      if (tr.dataset.group !== desiredGroup) tr.dataset.group = desiredGroup;
      // Update content with partial cell diff to avoid full row replace
      const html = this.renderRowFn ? this.renderRowFn(rowData) : this.defaultRowRenderer(rowData);
      const __t1 = performance.now();
      this._scratchTbody = applyRowDiff(tr, html, this._scratchTbody);
      const __t2 = performance.now();
      __tDiffMs += (__t2 - __t1);
      tr._lastOffsetTop = undefined; // invalidate last offset
      if (needsAttach) {
        attachFrag.appendChild(tr);
        _attachCount++;
      }
    }
    if (attachFrag.childNodes.length) this.tbody.appendChild(attachFrag);

    // Detach extra rows from DOM but keep in pool for reuse (batched)
    const _detachCount = detachExtraRows(this._rowPool, this.tbody, needCount);

    // Trim pool size to avoid unbounded growth (remove only detached rows)
    const maxPool = Math.max(needCount, Math.ceil(vr.visibleRowsCount * this._poolScreensCap));
    if (this._rowPool.length > maxPool) {
      // Ensure we never remove currently attached rows (first needCount)
      trimPool(this._rowPool, maxPool, needCount, this.tbody);
    }
    
    // Re-measure a row occasionally unless fixed height is enabled
    const fixedHeight = getVirtualConfig().FIXED_ROW_HEIGHT === true;
    if (!fixedHeight) {
      this._renderSinceMeasure = (this._renderSinceMeasure || 0) + 1;
      if (this._renderSinceMeasure >= this._measureEvery) {
        this._renderSinceMeasure = 0;
        const sampleRow = this._rowPool[0] || this.tbody.querySelector('tr');
        if (sampleRow) {
          const measured = Math.round(sampleRow.getBoundingClientRect().height);
          if (measured && measured !== this.rowHeight) {
            this.rowHeight = measured;
          }
        }
      }
    }
    
    // Notify that DOM has been updated (for event handler setup) with soft throttling
    try { maybeNotifyDomUpdate(this, { forceRender, structuralChange: (_attachCount > 0 || _detachCount > 0) }); } catch(e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore virtual scroller errors
    }
    
    // Update spacer height every render to avoid growing bottom gap when data changes
    const visibleCount = endIndex - startIndex;
    const computedTotal = Math.max(this.data.length * this.rowHeight, (startIndex * this.rowHeight) + (visibleCount * this.rowHeight));
    const lastKey = this._lastSpacerKey || '';
    const newKey = `${this.data.length}|${this.rowHeight}|${startIndex}|${endIndex}`;
    if (lastKey !== newKey) {
      this.spacer.style.height = `${computedTotal}px`;
      this._lastSpacerKey = newKey;
    }

    // Position only tbody for scroll offset, so thead can remain sticky
    const offsetTop = startIndex * this.rowHeight;
    if (this._lastOffsetTop !== offsetTop) {
      this.tbody.style.transform = `translate3d(0, ${offsetTop}px, 0)`;
      this._lastOffsetTop = offsetTop;
    }
    
    // Update performance metrics
    this.renderCount = (this.renderCount || 0) + 1;
    // Update last scroll metrics
    this._lastScrollTop = vr.scrollTop;
    this._lastScrollTs = vr.nowTs;
    
    // Minimal render complete
    try {
      if (typeof window !== 'undefined' && window.DEBUG) {
        const totalMs = performance.now() - __tRenderStart;
        // eslint-disable-next-line no-console
        console.log('🧪 VirtualScroller.render()', {
          totalMs: Math.round(totalMs * 100) / 100,
          diffMs: Math.round(__tDiffMs * 100) / 100,
          needCount,
          attachCount: _attachCount,
          detachCount: _detachCount,
          range: [startIndex, endIndex],
          bufferMultiplier: this._bufferMultiplier,
          dataLen: this.data.length,
        });
      }
    } catch (e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore debug logging errors
    }
  }

  /**
   * Recompute actual row height from DOM and adjust spacer to remove trailing gap
   */
  recomputeRowHeight() { try { recomputeRowHeight(this); } catch(e) { logError(ErrorCategory.SCROLL, 'virtualScroller', e);
      // Ignore virtual scroller errors
    } }

  /**
   * Default row renderer if none provided
   */
  defaultRowRenderer(rowData) {
    const cells = [
      `<td>${rowData.main || ''}</td>`,
      `<td>${rowData.peer || ''}</td>`, 
      `<td>${rowData.destination || ''}</td>`,
      `<td>${rowData.Min || 0}</td>`,
      `<td>${rowData.TCall || 0}</td>`,
      `<td>${rowData.SCall || 0}</td>`,
      `<td>${rowData.ASR || 0}</td>`,
      `<td>${rowData.ACD || 0}</td>`,
      `<td>${rowData.PDD || 0}</td>`,
      `<td>${rowData.ATime || 0}</td>`
    ];
    
    return cells.join('');
  }

  /**
   * Get current status
   */
  getStatus() { return getScrollerStatus(this); }

  /**
   * Programmatically scroll to a data index
   * align: 'start' | 'center' | 'end'
   */
  scrollToIndex(index, align = 'start') {
    if (!Number.isFinite(index) || index < 0) return;
    const clamped = Math.min(index, Math.max(0, this.data.length - 1));
    let offset = clamped * this.rowHeight;
    const containerHeight = this.container.clientHeight;
    if (align === 'center') {
      offset = Math.max(0, offset - Math.floor(containerHeight / 2));
    } else if (align === 'end') {
      offset = Math.max(0, offset - Math.max(0, containerHeight - this.rowHeight));
    }
    if (this.usesPageScroll) {
      const rectTop = this.container.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: rectTop + offset, behavior: 'auto' });
    } else {
      this.container.scrollTop = offset;
    }
    this.render(true);
  }

  /**
   * Update a single visible row without full render
   */
  updateRowAt(index, newRowData) {
    if (newRowData && typeof newRowData === 'object') {
      this.data[index] = newRowData;
    }
    patchRowAt(this, index);
  }

  /**
   * Batch update a slice of rows without full render
   * options: { forceRender: boolean }
   */
  updateRows(rangeStart, rowsArray, options = {}) {
    patchRowsRange(this, rangeStart, rowsArray, options);
  }
  /**
{{ ... }}
   */
  throttledRender() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    this.scrollTimeout = setTimeout(() => {
      this.render();
    }, this.scrollThrottle);
  }

  /**
   * RAF-based scroll handler for smooth updates
   */
  _onScroll() {
    if (this._rafScheduled) return;
    this._rafScheduled = true;
    requestAnimationFrame(() => {
      this._rafScheduled = false;
      this.render();
    });
  }

  /**
   * Window scroll handler when container does not have its own scroll
   */
  _onWindowScroll() {
    this._onScroll();
  }

  /**
   * Analyze row types for logging
   */
  analyzeRowTypes(visibleData) {
    return visibleData.reduce((counts, row) => {
      const type = row.type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, { main: 0, peer: 0, hourly: 0, unknown: 0 });
  }

  /**
   * Destroy virtual scroller
   */
  destroy() {
    if (this.container) {
      this.container.removeEventListener('scroll', this._onScroll);
    }
    if (this._onWindowScroll) {
      window.removeEventListener('scroll', this._onWindowScroll);
    }
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    this.isInitialized = false;
  }
}
