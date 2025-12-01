// static/js/rendering/table-renderer.js
// Responsibility: Coordinate virtual vs standard table rendering
import { renderGroupedTable } from '../dom/table.js';
import { getRenderingMode, isVirtualScrollEnabled } from '../state/tableState.js';
import { setVirtualManager } from '../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VIRTUALIZATION_THRESHOLD = 50;
const INFLIGHT_GUARD_MS = 200;
const TABLE_BODY_ID = 'tableBody';

const VIRTUAL_DOM_IDS = [
  'virtual-scroll-container',
  'virtual-scroll-spacer',
  'summaryTable',
  'tableBody'
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function uniqueByKeys(arr, keys) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const result = [];
  const len = arr.length;
  const keyCount = keys.length;

  for (let i = 0; i < len; i++) {
    const r = arr[i];
    // build key inline instead of map().join()
    let k = '';
    for (let j = 0; j < keyCount; j++) {
      if (j > 0) k += '|';
      k += r?.[keys[j]] ?? '';
    }
    if (!seen.has(k)) {
      seen.add(k);
      result.push(r);
    }
  }
  return result;
}

function isDomVirtualReady() {
  // use indexed loop instead of every()
  const len = VIRTUAL_DOM_IDS.length;
  for (let i = 0; i < len; i++) {
    if (!document.getElementById(VIRTUAL_DOM_IDS[i])) return false;
  }
  return true;
}

function clearTableBody() {
  const tbody = document.getElementById(TABLE_BODY_ID);
  if (tbody) tbody.innerHTML = '';
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ─────────────────────────────────────────────────────────────
// TableRenderer class
// ─────────────────────────────────────────────────────────────

export class TableRenderer {
  constructor() {
    this.virtualManager = null;
    this.isVirtualMode = false;
    this._vmUnavailable = false;
    this._inflightUntil = 0;
  }

  async initialize() {
    return true;
  }

  async renderTable(mainRows, peerRows, hourlyRows, options = {}) {
    // single-flight guard
    const now = getNow();
    if (this._inflightUntil && now < this._inflightUntil) {
      return { success: true, suppressed: true };
    }
    this._inflightUntil = now + INFLIGHT_GUARD_MS;

    // dedupe rows
    const mRows = uniqueByKeys(mainRows, ['main', 'destination']);
    const pRows = uniqueByKeys(peerRows, ['main', 'peer', 'destination']);
    const hKey = hourlyRows?.[0]?.time !== undefined ? 'time' : 'hour';
    const hRows = uniqueByKeys(hourlyRows, ['main', 'peer', 'destination', hKey]);

    const useVirtual = this._shouldUseVirtual(mRows.length, options.forceStandard);

    if (useVirtual) {
      const vmReady = await this._ensureVirtualManager();
      if (vmReady && this._isVmActive()) {
        return this._renderVirtual(mRows, pRows, hRows);
      }
    }

    return this._renderStandard(mRows, pRows, hRows);
  }

  _shouldUseVirtual(rowCount, forceStandard = false) {
    if (forceStandard || this._vmUnavailable) return false;

    const mode = getRenderingMode();
    const enabled = isVirtualScrollEnabled();
    const domReady = isDomVirtualReady();

    if (mode === 'virtual') return enabled && domReady;
    if (mode === 'standard') return false;
    // auto mode
    return rowCount >= VIRTUALIZATION_THRESHOLD && enabled && domReady;
  }

  async _ensureVirtualManager() {
    if (this.virtualManager) return true;

    try {
      const { VirtualManager } = await import('../virtual/virtual-manager.js');
      this.virtualManager = new VirtualManager();
      const success = await this.virtualManager.initialize();

      if (!success) {
        this._vmUnavailable = true;
        return false;
      }

      setVirtualManager(this.virtualManager);
      return true;
    } catch (e) {
      logError(ErrorCategory.RENDER, 'TableRenderer:ensureVM', e);
      this._vmUnavailable = true;
      return false;
    }
  }

  _isVmActive() {
    return this.virtualManager?.isActive && this.virtualManager?.adapter?.isActive === true;
  }

  _renderVirtual(mainRows, peerRows, hourlyRows) {
    if (!this._isVmActive()) {
      this._vmUnavailable = true;
      return this._renderStandard(mainRows, peerRows, hourlyRows);
    }

    try {
      clearTableBody();
      const success = this.virtualManager.renderVirtualTable(mainRows, peerRows, hourlyRows);

      if (success) {
        this.isVirtualMode = true;
        return { success: true, mode: 'virtual' };
      }

      this._vmUnavailable = true;
      return this._renderStandard(mainRows, peerRows, hourlyRows);
    } catch (e) {
      logError(ErrorCategory.RENDER, 'TableRenderer:renderVirtual', e);
      this._vmUnavailable = true;
      return this._renderStandard(mainRows, peerRows, hourlyRows);
    }
  }

  _renderStandard(mainRows, peerRows, hourlyRows) {
    try {
      // tear down virtual if active
      if (this.virtualManager?.isActive) {
        this.virtualManager.destroy();
        this.virtualManager = null;
      }

      clearTableBody();
      renderGroupedTable(mainRows, peerRows, hourlyRows);
      this.isVirtualMode = false;

      this.virtualManager?.updateUI(false);

      return { success: true, mode: 'standard' };
    } catch (e) {
      logError(ErrorCategory.RENDER, 'TableRenderer:renderStandard', e);
      return { success: false, mode: 'error', error: e };
    }
  }

  getStatus() {
    return {
      isVirtualMode: this.isVirtualMode,
      hasVirtualCapabilities: !!this.virtualManager,
      virtualManager: this.virtualManager?.getStatus() ?? null
    };
  }

  destroy() {
    if (this.virtualManager) {
      this.virtualManager.destroy();
      this.virtualManager = null;
    }
    this.isVirtualMode = false;
    this._vmUnavailable = false;
    this._inflightUntil = 0;
  }
}
