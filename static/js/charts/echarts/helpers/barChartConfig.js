// static/js/charts/echarts/helpers/barChartConfig.js
// Responsibility: ECharts option builders for bar chart
import { buildCenters, makePairSets, detectProviderKey } from './dataTransform.js';
import { getStepMs } from './time.js';
import { buildBarSeries } from '../builders/BarChartBuilder.js';
import { computeChartGrids } from '../../services/layout.js';
import { makeBarLineLikeTooltip } from './tooltip.js';
import { getChartsZoomRange, isChartsBarPerProvider } from '../../../state/runtimeFlags.js';
import { buildLabelsEffective } from './barChartData.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Axes builders
// ─────────────────────────────────────────────────────────────

function buildXAxes(grids, fromTs, toTs) {
  return grids.map((g, i) => ({
    type: 'time',
    gridIndex: i,
    min: Number.isFinite(fromTs) ? fromTs : null,
    max: Number.isFinite(toTs) ? toTs : null,
    axisLabel: { color: '#6e7781' },
    axisLine: { lineStyle: { color: '#888' } },
    axisTick: { alignWithLabel: true, length: 6 },
    splitLine: { show: true, lineStyle: { color: '#eaeef2' } },
    axisPointer: { show: false, label: { show: false }, triggerTooltip: false }
  }));
}

function buildYAxes(grids) {
  return grids.map((g, i) => ({
    type: 'value',
    gridIndex: i,
    axisLabel: { show: false },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false }
  }));
}

// ─────────────────────────────────────────────────────────────
// Graphic labels
// ─────────────────────────────────────────────────────────────

const AXIS_NAMES = ['TCalls', 'ASR', 'Minutes', 'ACD'];

function buildGraphicLabels(grids) {
  try {
    return AXIS_NAMES.map((name, i) => {
      const isFirst = i === 0;
      const y = isFirst ? (grids[i].top + 6) : (grids[i].top + 4);
      return {
        type: 'text',
        left: 6,
        top: y,
        z: 10,
        style: {
          text: name,
          fill: '#6e7781',
          font: '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
        }
      };
    });
  } catch (e) {
    logError(ErrorCategory.CHART, 'barChartConfig:buildGraphicLabels', e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Zoom values
// ─────────────────────────────────────────────────────────────

function computeZoomValues(fromTs, toTs) {
  let startVal = Number.isFinite(fromTs) ? fromTs : null;
  let endVal = Number.isFinite(toTs) ? toTs : null;

  try {
    const zr = getChartsZoomRange();
    if (zr && Number.isFinite(zr.fromTs) && Number.isFinite(zr.toTs) && zr.toTs > zr.fromTs) {
      const clamp = (v) => (Number.isFinite(fromTs) && Number.isFinite(toTs))
        ? Math.max(fromTs, Math.min(toTs, v))
        : v;
      startVal = clamp(zr.fromTs);
      endVal = clamp(zr.toTs);
    }

    if (!(Number.isFinite(startVal) && Number.isFinite(endVal) && endVal > startVal)) {
      startVal = Number.isFinite(fromTs) ? fromTs : null;
      endVal = Number.isFinite(toTs) ? toTs : null;
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'barChartConfig:computeZoomValues', e);
  }

  return { startVal, endVal };
}

// ─────────────────────────────────────────────────────────────
// Main option builder
// ─────────────────────────────────────────────────────────────

export function buildChartOptions({ opts, data, containerHeight, chart }) {
  const fromTs = Number(opts.fromTs);
  const toTs = Number(opts.toTs);
  const step = Number(opts.stepMs) || getStepMs(opts.interval);

  const realHeight = containerHeight || 520;
  const grids = computeChartGrids(realHeight);
  const centers = buildCenters(fromTs, toTs, step);

  // build pair sets for each metric
  const setsT = makePairSets(opts, data, getSeries(opts.tCallsSeries, data?.TCalls), centers);
  const setsA = makePairSets(opts, data, getSeries(opts.asrSeries, data?.ASR), centers);
  const setsM = makePairSets(opts, data, getSeries(opts.minutesSeries, data?.Minutes), centers);
  const setsC = makePairSets(opts, data, getSeries(opts.acdSeries, data?.ACD), centers);

  const { startVal, endVal } = computeZoomValues(fromTs, toTs);

  // build effective labels
  const labelsEffective = buildLabelsEffective({
    labels: opts.labels,
    providerRows: opts.providerRows,
    stepMs: step,
    interval: opts.interval
  });

  const showLabels = safeCall(() => isChartsBarPerProvider(), false);
  const providerKey = safeCall(() => detectProviderKey(opts.providerRows || []), null);

  // build series
  let series = buildBarSeries({
    setsT,
    setsA,
    setsM,
    setsC,
    centers,
    interval: opts.interval,
    stepMs: step,
    labels: labelsEffective,
    colorMap: opts.colorMap,
    providerRows: opts.providerRows || [],
    providerKey
  });

  // filter overlay if not showing labels
  if (!showLabels) {
    series = series.filter(s => !(s?.type === 'custom' && s?.name === 'LabelsOverlay'));
  }

  // optimize overlay series
  for (const s of series) {
    if (s?.type === 'custom' && s?.name === 'LabelsOverlay') {
      s.animation = false;
      s.animationDuration = 0;
      s.animationEasing = 'linear';
      s.renderMode = 'canvas';
    }
  }

  const mainOption = {
    animation: true,
    animationDurationUpdate: 200,
    animationEasingUpdate: 'cubicOut',
    grid: grids,
    xAxis: buildXAxes(grids, fromTs, toTs),
    yAxis: buildYAxes(grids),
    tooltip: {
      trigger: 'item',
      confine: true,
      order: 'valueAsc',
      formatter: makeBarLineLikeTooltip({ chart, stepMs: step }),
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e6e9ef',
      borderWidth: 1,
      padding: [9, 12],
      textStyle: { color: 'var(--ds-color-fg)' },
      extraCssText: 'border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.07); line-height:1.35;'
    },
    dataZoom: [{
      type: 'inside',
      xAxisIndex: [0, 1, 2, 3],
      startValue: startVal,
      endValue: endVal,
      throttle: 80,
      zoomOnMouseWheel: 'shift',
      moveOnMouseWheel: false,
      moveOnMouseMove: true
    }],
    series,
    graphic: buildGraphicLabels(grids),
    __labelsEffective: labelsEffective
  };

  // slider option
  const sliderOption = buildSliderOption({ setsT, fromTs, toTs, startVal, endVal });

  return { main: mainOption, slider: sliderOption, labelsEffective };
}

// ─────────────────────────────────────────────────────────────
// Slider option builder
// ─────────────────────────────────────────────────────────────

function buildSliderOption({ setsT, fromTs, toTs, startVal, endVal }) {
  const colorMain = '#4f86ff';
  const sliderGrid = { left: 40, right: 16, top: 4, bottom: 4, height: 40 };

  return {
    animation: false,
    grid: [sliderGrid],
    xAxis: [{
      type: 'time',
      gridIndex: 0,
      min: Number.isFinite(fromTs) ? fromTs : null,
      max: Number.isFinite(toTs) ? toTs : null,
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false }
    }],
    yAxis: [{
      type: 'value',
      gridIndex: 0,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false }
    }],
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        startValue: startVal,
        endValue: endVal,
        height: 32,
        bottom: 8,
        throttle: 80,
        backgroundColor: 'rgba(0,0,0,0)',
        fillerColor: 'rgba(79,134,255,0.12)',
        showDataShadow: false,
        dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
        selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } }
      },
      {
        type: 'inside',
        xAxisIndex: 0,
        startValue: startVal,
        endValue: endVal,
        zoomOnMouseWheel: 'shift',
        moveOnMouseWheel: false,
        moveOnMouseMove: true
      }
    ],
    series: [{
      type: 'bar',
      data: (setsT.curr || []).filter(d => d && d[1] != null),
      xAxisIndex: 0,
      yAxisIndex: 0,
      barWidth: 3,
      itemStyle: { color: colorMain },
      silent: true,
      animation: false
    }]
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getSeries(optSeries, dataSeries) {
  if (Array.isArray(optSeries) && optSeries.length) return optSeries;
  return Array.isArray(dataSeries) ? dataSeries : [];
}

function safeCall(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    logError(ErrorCategory.CHART, 'barChartConfig:safeCall', e);
    return fallback;
  }
}
