// Table Renderer Module - Single Responsibility: Coordinate Table Rendering Strategy
// Localized comments in English as requested

import { renderGroupedTable } from '../dom/table.js';
import { getRenderingMode, isVirtualScrollEnabled } from '../state/tableState.js';
import { setVirtualManager } from '../state/moduleRegistry.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';

/**
 * Table Renderer - Coordinates between standard and virtual rendering
 * Responsibility: Choose appropriate rendering strategy and coordinate execution
 */
export class TableRenderer {
  constructor() {
    this.virtualManager = null;
    this.isVirtualMode = false;
    // Remember if virtual init failed in this session to avoid repeated warnings
    this._vmUnavailable = false;
  }

  /**
   * Initialize table renderer with virtual capabilities
   */
  async initialize() {
    // Defer VirtualManager loading to first actual need in renderTable()
    return true;
  }

  /**
   * Render table using appropriate strategy (virtual or standard)
   */
  async renderTable(mainRows, peerRows, hourlyRows, options = {}) {
    // Single-flight guard to avoid rapid re-entry from multiple sources
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this._inflightUntil && now < this._inflightUntil) {
      console.log('⏳ TableRenderer.renderTable(): suppressed rapid re-entry');
      return { success: true, suppressed: true };
    }
    this._inflightUntil = now + 200;
    const { forceStandard = false } = options;
    // Deduplicate rows by their natural keys to avoid duplicate rendering
    const uniqueByKeys = (arr, keys) => {
      if (!Array.isArray(arr)) return [];
      const seen = new Set();
      const out = [];
      for (const r of arr) {
        const k = keys.map(k => (r?.[k] ?? '')).join('|');
        if (!seen.has(k)) { seen.add(k); out.push(r); }
      }
      return out;
    };
    // Natural keys
    const mRows = uniqueByKeys(mainRows, ['main', 'destination']);
    const pRows = uniqueByKeys(peerRows, ['main', 'peer', 'destination']);
    // Hourly rows may use either 'time' or 'hour' depending on source
    const hKey = (hourlyRows && hourlyRows.length && Object.prototype.hasOwnProperty.call(hourlyRows[0], 'time')) ? 'time' : 'hour';
    const hRows = uniqueByKeys(hourlyRows, ['main', 'peer', 'destination', hKey]);
    
    // Get rendering preferences from state
    const renderingMode = getRenderingMode();
    const virtualEnabled = isVirtualScrollEnabled();
    
    // Determine rendering strategy based on state, data size, and DOM readiness
    let useVirtual = false;
    const domVirtualReady = () => {
      try {
        return !!(document.getElementById('virtual-scroll-container') &&
                  document.getElementById('virtual-scroll-spacer') &&
                  document.getElementById('summaryTable') &&
                  document.getElementById('tableBody'));
      } catch (e) { logError(ErrorCategory.RENDER, 'tableRenderer', e); return false; }
    };
    
    if (forceStandard) {
      useVirtual = false;
    } else if (renderingMode === 'virtual' && virtualEnabled && !this._vmUnavailable && domVirtualReady()) {
      useVirtual = true;
    } else if (renderingMode === 'standard') {
      useVirtual = false;
    } else if (renderingMode === 'auto') {
      useVirtual = this.shouldUseVirtualization(mRows.length) && virtualEnabled && !this._vmUnavailable && domVirtualReady();
    }
    
    if (useVirtual) {
      // Ensure VirtualManager is loaded and initialized on first use
      if (!this.virtualManager) {
        try {
          const mod = await import('../virtual/virtual-manager.js');
          const { VirtualManager } = mod;
          this.virtualManager = new VirtualManager();
          const success = await this.virtualManager.initialize();
          if (!success) {
            console.warn('⚠️ Table Renderer: Virtual manager failed to initialize, falling back to standard');
            // Mark as unavailable for this session to avoid repeated attempts/warnings
            this._vmUnavailable = true;
            return this.renderStandardTable(mRows, pRows, hRows);
          }
          // Expose via registry for UI controls only after successful init
          setVirtualManager(this.virtualManager);
          console.log('✅ Table Renderer: Virtual manager initialized on-demand');
        } catch (e) {
          console.error('❌ Table Renderer: Failed to lazy-load VirtualManager, fallback to standard', e);
          this._vmUnavailable = true;
          return this.renderStandardTable(mRows, pRows, hRows);
        }
      }
      // Guard: if VM/adapter is not active for any reason, fallback without invoking initialRender
      if (!this.virtualManager || !this.virtualManager.isActive || !this.virtualManager.adapter || this.virtualManager.adapter.isActive !== true) {
        this._vmUnavailable = true;
        return this.renderStandardTable(mRows, pRows, hRows);
      }
      return this.renderVirtualTable(mRows, pRows, hRows);
    } else {
      return this.renderStandardTable(mRows, pRows, hRows);
    }
  }

  /**
   * Render using virtual scrolling
   */
  renderVirtualTable(mainRows, peerRows, hourlyRows) {
    try {
      console.log(`🚀 Table Renderer: Using virtual rendering for ${mainRows.length} rows`);
      // Extra guard to avoid calling into VM when inactive (prevents warnings)
      if (!this.virtualManager || !this.virtualManager.isActive || !this.virtualManager.adapter || this.virtualManager.adapter.isActive !== true) {
        this._vmUnavailable = true;
        return this.renderStandardTable(mainRows, peerRows, hourlyRows);
      }
      // Prevent duplicates if standard rows were previously rendered into tbody
      try {
        const tbody = document.getElementById('tableBody');
        if (tbody) tbody.innerHTML = '';
      } catch (e) { logError(ErrorCategory.RENDER, 'tableRenderer', e); /* best-effort */ }
      
      const success = this.virtualManager.renderVirtualTable(mainRows, peerRows, hourlyRows);
      
      if (success) {
        this.isVirtualMode = true;
        console.log('✅ Table Renderer: Virtual rendering successful');
        return { success: true, mode: 'virtual' };
      } else {
        console.warn('⚠️ Table Renderer: Virtual rendering failed, falling back');
        this._vmUnavailable = true;
        return this.renderStandardTable(mainRows, peerRows, hourlyRows);
      }
    } catch (error) {
      console.error('❌ Table Renderer: Virtual rendering error', error);
      this._vmUnavailable = true;
      return this.renderStandardTable(mainRows, peerRows, hourlyRows);
    }
  }

  /**
   * Render using standard table rendering
   */
  renderStandardTable(mainRows, peerRows, hourlyRows) {
    try {
      console.log(`📋 Table Renderer: Using standard rendering for ${mainRows.length} rows`);
      // Ensure virtual mode is fully torn down to avoid duplicate rows
      try {
        if (this.virtualManager && this.virtualManager.isActive) {
          this.virtualManager.destroy();
          this.virtualManager = null;
        }
        const tbody = document.getElementById('tableBody');
        if (tbody) tbody.innerHTML = '';
      } catch (e) { logError(ErrorCategory.RENDER, 'tableRenderer', e); /* best-effort */ }
      
      renderGroupedTable(mainRows, peerRows, hourlyRows);
      this.isVirtualMode = false;
      
      // Update UI to reflect standard mode
      if (this.virtualManager) {
        this.virtualManager.updateUI(false);
      }
      
      console.log('✅ Table Renderer: Standard rendering successful');
      return { success: true, mode: 'standard' };
    } catch (error) {
      console.error('❌ Table Renderer: Standard rendering error', error);
      return { success: false, mode: 'error', error };
    }
  }

  /**
   * Determine if virtualization should be used
   */
  shouldUseVirtualization(rowCount) {
    const VIRTUALIZATION_THRESHOLD = 50; // Lower threshold for better UX
    return rowCount >= VIRTUALIZATION_THRESHOLD;
  }

  /**
   * Get current rendering status
   */
  getStatus() {
    return {
      isVirtualMode: this.isVirtualMode,
      hasVirtualCapabilities: !!this.virtualManager,
      virtualManager: this.virtualManager ? this.virtualManager.getStatus() : null
    };
  }

  /**
   * Force refresh of current table
   */
  refresh() {
    if (this.isVirtualMode && this.virtualManager) {
      // Virtual mode refresh would need current data - this is a placeholder
      console.log('🔄 Table Renderer: Virtual refresh requested');
    } else {
      console.log('🔄 Table Renderer: Standard refresh requested');
    }
  }

  /**
   * Cleanup renderer
   */
  destroy() {
    if (this.virtualManager) {
      this.virtualManager.destroy();
      this.virtualManager = null;
    }
    this.isVirtualMode = false;
    // reset flags for fresh start
    this._vmUnavailable = false;
    this._inflightUntil = 0;
    console.log('🗑️ Table Renderer: Destroyed');
  }
}
