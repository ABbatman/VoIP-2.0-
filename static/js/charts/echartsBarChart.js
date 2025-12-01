// static/js/charts/echartsBarChart.js
// Responsibility: Bar chart orchestration and lifecycle management
import * as echarts from 'echarts';
import { getStepMs } from './echarts/helpers/time.js';
import { subscribe } from '../state/eventBus.js';
import { attachCapsuleTooltip, detachCapsuleTooltip } from './echarts/helpers/capsuleTooltip.js';
import { initChart, setOptionWithZoomSync } from './echarts/renderer/EchartsRenderer.js';
import { getRange } from './echarts/services/zoomManager.js';
import { getChartsZoomRange } from '../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { buildColorMap, createCapsuleDataProvider } from './echarts/helpers/barChartData.js';
import { buildChartOptions } from './echarts/helpers/barChartConfig.js';

// ─────────────────────────────────────────────────────────────
// Container helpers
// ─────────────────────────────────────────────────────────────

function ensureContainer(container) {
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`[echartsBarChart] Container not found: ${container}`);
    return el;
  }
  if (!container) throw new Error('[echartsBarChart] Container is required');
  return container;
}

function getContainerHeight(el, fallback = 520) {
  return el.clientHeight || el.getBoundingClientRect().height || fallback;
}

// ─────────────────────────────────────────────────────────────
// Zoom state helpers
// ─────────────────────────────────────────────────────────────

function resetZoomIfRangeExpanded(fromTs, toTs) {
  try {
    const w = typeof window !== 'undefined' ? window : {};
    const prev = w.__chartsLastFilters || null;
    const f = Number(fromTs);
    const t = Number(toTs);

    if (prev && Number.isFinite(f) && Number.isFinite(t)) {
      const pf = Number(prev.fromTs);
      const pt = Number(prev.toTs);
      if ((Number.isFinite(pf) && f < pf) || (Number.isFinite(pt) && t > pt)) {
        w.__chartsZoomRange = null;
      }
    }

    w.__chartsLastFilters = { fromTs: f, toTs: t };
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsBarChart:resetZoomIfRangeExpanded', e);
  }
}

function syncZoomRange(chart, sliderChart, fromTs, toTs) {
  try {
    const zr = getRange();
    if (!zr || !Number.isFinite(zr.fromTs) || !Number.isFinite(zr.toTs)) return;

    if (!chart.isDisposed()) {
      chart.setOption({ dataZoom: [{ startValue: zr.fromTs, endValue: zr.toTs }] }, { lazyUpdate: true });
    }
    if (sliderChart && !sliderChart.isDisposed()) {
      sliderChart.setOption({
        dataZoom: [{ startValue: zr.fromTs, endValue: zr.toTs }, { startValue: zr.fromTs, endValue: zr.toTs }]
      }, { lazyUpdate: true });
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsBarChart:syncZoomRange', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Bar width management
// ─────────────────────────────────────────────────────────────

function createBarWidthManager(chart, base) {
  const computeStepWidthPx = () => {
    try {
      if (chart.isDisposed?.()) return null;

      const step = Number(base.stepMs) || getStepMs(base.interval);
      const zr = getChartsZoomRange();
      const ref = zr?.fromTs ?? base.fromTs;

      if (!Number.isFinite(ref) || !Number.isFinite(step) || step <= 0) return null;

      const p0 = chart.convertToPixel({ xAxisIndex: 0 }, ref);
      const p1 = chart.convertToPixel({ xAxisIndex: 0 }, ref + step);
      const w = Math.abs(Number(p1) - Number(p0));

      return Number.isFinite(w) && w > 0 ? Math.max(2, Math.round(w)) : null;
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:computeStepWidthPx', e);
      return null;
    }
  };

  const applyDynamicBarWidth = () => {
    if (chart.isDisposed?.()) return;

    const w = computeStepWidthPx();
    if (!Number.isFinite(w)) return;

    const desired = Math.max(2, Math.floor(w * 0.92));
    const each = Math.max(2, Math.floor(desired * 0.35));

    if (chart.__lastBarWidth === each) return;

    try {
      const cur = chart.getOption();
      const upd = (cur.series || [])
        .filter(s => s?.type === 'bar')
        .map(s => ({ id: s.id, barWidth: each }));

      if (upd.length) {
        chart.setOption({ series: upd }, { lazyUpdate: true });
        chart.__lastBarWidth = each;
      }
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:applyDynamicBarWidth', e);
    }
  };

  return { applyDynamicBarWidth };
}

// ─────────────────────────────────────────────────────────────
// Base options factory
// ─────────────────────────────────────────────────────────────

function createBaseOptions(options, el) {
  const base = {
    fromTs: options.fromTs || null,
    toTs: options.toTs || null,
    height: options.height || (el.clientHeight || 300),
    interval: options.interval || (options.stepMs === 5 * 60e3 ? '5m' : (options.stepMs === 3600e3 ? '1h' : '1d')),
    stepMs: getStepMs(options.interval, options.stepMs),
    tCallsSeries: Array.isArray(options.tCallsSeries) ? options.tCallsSeries : [],
    asrSeries: Array.isArray(options.asrSeries) ? options.asrSeries : [],
    minutesSeries: Array.isArray(options.minutesSeries) ? options.minutesSeries : [],
    acdSeries: Array.isArray(options.acdSeries) ? options.acdSeries : [],
    labels: options?.labels && typeof options.labels === 'object' ? options.labels : {},
    colorMap: options?.colorMap && typeof options.colorMap === 'object' ? options.colorMap : undefined,
    providerRows: Array.isArray(options.providerRows) ? options.providerRows : []
  };

  // build color map if not provided
  if (!base.colorMap) {
    base.colorMap = buildColorMap({
      providerRows: base.providerRows,
      labels: base.labels
    });
  }

  return base;
}

// ─────────────────────────────────────────────────────────────
// Main render function
// ─────────────────────────────────────────────────────────────

export async function renderBarChartEcharts(container, data = [], options = {}) {
  const el = ensureContainer(container);

  // dispose existing chart
  try {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsBarChart:dispose', e);
  }

  const chart = await initChart(el);
  if (!chart) {
    console.warn('[echartsBarChart] Container has no dimensions, skipping render');
    return { update: () => {}, dispose: () => {}, getInstance: () => null };
  }

  // init slider chart
  const sliderEl = document.getElementById('chart-slider');
  let sliderChart = null;
  if (sliderEl) {
    try {
      const existingSlider = echarts.getInstanceByDom(sliderEl);
      if (existingSlider) existingSlider.dispose();
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:sliderDispose', e);
    }
    sliderChart = await initChart(sliderEl);
  }

  // connect charts
  if (chart && sliderChart) {
    echarts.connect([chart, sliderChart]);
  }

  // allow scrolling when not zooming
  el.addEventListener('wheel', (e) => {
    if (!e.shiftKey) e.stopPropagation();
  }, { capture: true, passive: false });

  // state
  let unsubscribeToggle = null;
  let capsuleTooltipAttached = false;
  const base = createBaseOptions(options, el);
  const METRIC_BY_GRID = { 0: 'TCalls', 1: 'ASR', 2: 'Minutes', 3: 'ACD' };

  resetZoomIfRangeExpanded(base.fromTs, base.toTs);

  const { applyDynamicBarWidth } = createBarWidthManager(chart, base);

  // build options
  const buildOption = (opts, d) => {
    const containerHeight = getContainerHeight(el, opts.height || 520);
    return buildChartOptions({ opts, data: d, containerHeight, chart });
  };

  const { main, slider, labelsEffective } = buildOption(base, data);

  // attach capsule tooltip
  const attachTooltip = (mainOption, opts) => {
    if (capsuleTooltipAttached) return;

    try {
      const externalSource = opts.capsuleTooltipData || options.capsuleTooltipData ||
        (typeof window !== 'undefined' ? window.__capsuleTooltipData : null);

      const getCapsuleData = createCapsuleDataProvider({
        labelsEffective: mainOption.__labelsEffective,
        providerRows: opts.providerRows || base.providerRows,
        stepMs: opts.stepMs || base.stepMs,
        interval: opts.interval || base.interval,
        externalSource
      });

      attachCapsuleTooltip(chart, {
        getCapsuleData,
        textColor: 'var(--ds-color-fg)',
        metricByGridIndex: METRIC_BY_GRID
      });

      capsuleTooltipAttached = true;
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:attachTooltip', e);
    }
  };

  // render main chart
  setOptionWithZoomSync(chart, main, {
    onAfterSet: () => {
      try {
        requestAnimationFrame(() => setTimeout(applyDynamicBarWidth, 0));
      } catch (e) {
        logError(ErrorCategory.CHART, 'echartsBarChart:onAfterSet', e);
      }
      attachTooltip(main, base);
    }
  });

  // render slider chart
  if (sliderChart && slider) {
    setOptionWithZoomSync(sliderChart, slider);
  }

  // sync zoom range
  syncZoomRange(chart, sliderChart, base.fromTs, base.toTs);

  // subscribe to provider toggle
  try {
    unsubscribeToggle = subscribe('charts:bar:perProviderChanged', () => {
      try {
        const { main: nextMain, slider: nextSlider } = buildOption(base, data);
        setOptionWithZoomSync(chart, nextMain);
        if (sliderChart) setOptionWithZoomSync(sliderChart, nextSlider);
      } catch (e) {
        logError(ErrorCategory.CHART, 'echartsBarChart:perProviderChanged', e);
      }
    });
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsBarChart:subscribe', e);
  }

  // register bar width handler
  try {
    if (!chart.isDisposed()) {
      chart.on('finished', applyDynamicBarWidth);
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'echartsBarChart:finishedHandler', e);
  }

  // ─────────────────────────────────────────────────────────────
  // Update function
  // ─────────────────────────────────────────────────────────────

  function update(newData = data, newOptions = {}) {
    const merged = { ...base, ...newOptions };

    // sync base state
    try {
      base.fromTs = merged.fromTs;
      base.toTs = merged.toTs;
      base.interval = merged.interval || base.interval;
      base.stepMs = Number.isFinite(merged.stepMs) ? Number(merged.stepMs) : getStepMs(base.interval);
      base.tCallsSeries = Array.isArray(merged.tCallsSeries) ? merged.tCallsSeries : base.tCallsSeries;
      base.asrSeries = Array.isArray(merged.asrSeries) ? merged.asrSeries : base.asrSeries;
      base.minutesSeries = Array.isArray(merged.minutesSeries) ? merged.minutesSeries : base.minutesSeries;
      base.acdSeries = Array.isArray(merged.acdSeries) ? merged.acdSeries : base.acdSeries;
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:updateBase', e);
    }

    const { main: nextMain, slider: nextSlider, labelsEffective: nextLabels } = buildOption(merged, newData);

    setOptionWithZoomSync(chart, nextMain, {
      onAfterSet: () => {
        try { applyDynamicBarWidth(); } catch (e) { logError(ErrorCategory.CHART, 'echartsBarChart:updateBarWidth', e); }

        // reattach capsule tooltip
        try { detachCapsuleTooltip(chart); } catch (e) { logError(ErrorCategory.CHART, 'echartsBarChart:detachTooltip', e); }
        capsuleTooltipAttached = false;
        attachTooltip(nextMain, merged);
      }
    });

    if (sliderChart && nextSlider) {
      setOptionWithZoomSync(sliderChart, nextSlider);
    }

    // sync zoom
    try {
      const zr = getChartsZoomRange();
      const lo = Number(merged.fromTs);
      const hi = Number(merged.toTs);
      const clamp = (v) => (Number.isFinite(lo) && Number.isFinite(hi)) ? Math.max(lo, Math.min(hi, v)) : v;
      const sv = Number.isFinite(zr?.fromTs) ? clamp(zr.fromTs) : lo;
      const ev = Number.isFinite(zr?.toTs) ? clamp(zr.toTs) : hi;

      if (Number.isFinite(sv) && Number.isFinite(ev) && ev > sv) {
        if (!chart.isDisposed()) {
          chart.setOption({ dataZoom: [{ startValue: sv, endValue: ev }] }, { lazyUpdate: true });
        }
        if (sliderChart && !sliderChart.isDisposed()) {
          sliderChart.setOption({
            dataZoom: [{ startValue: sv, endValue: ev }, { startValue: sv, endValue: ev }]
          }, { lazyUpdate: true });
        }
      }
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:updateZoom', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Dispose function
  // ─────────────────────────────────────────────────────────────

  function dispose() {
    try {
      if (typeof unsubscribeToggle === 'function') unsubscribeToggle();
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:unsubscribe', e);
    }

    try {
      detachCapsuleTooltip(chart);
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:detachTooltipDispose', e);
    }

    try {
      chart.dispose();
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:chartDispose', e);
    }

    try {
      if (sliderChart) sliderChart.dispose();
    } catch (e) {
      logError(ErrorCategory.CHART, 'echartsBarChart:sliderDispose', e);
    }
  }

  function getInstance() {
    return chart;
  }

  return { update, dispose, getInstance };
}
