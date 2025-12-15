// static/js/charts/echarts/builders/MultiLineBuilder.js
// Responsibility: Build ECharts option for multi-line chart
import { toPairs, withGapBreaks, shiftForwardPairs } from '../helpers/dataTransform.js';
import { getStepMs } from '../helpers/time.js';
import { MAIN_BLUE } from '../helpers/colors.js';
import { computeChartGrids } from '../../services/layout.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';
import { detectTimeScale, getLineVisuals, getZoomStrength, getPointDensity } from '../../../visualEnhancements/visualMapping.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600e3;
const PREV_COLOR = 'rgba(140,148,156,0.85)';
const METRIC_NAMES = ['TCalls', 'ASR', 'Minutes', 'ACD'];
const LOW_ASR_THRESHOLD = 30;
const ESTIMATED_WIDTH = 800;

const SLIDER_GRID = { left: 40, right: 16, top: 4, bottom: 4, height: 40 };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function cleanPairs(pairs) {
  return (pairs || []).filter(d => d[1] != null);
}

function estimateRangeMs(minX, maxX, interval) {
  if (minX != null && maxX != null) return maxX - minX;
  if (interval === '5m') return 8 * 3600 * 1000;
  if (interval === '1h') return 2 * 3600 * 1000;
  return DAY_MS;
}

function getStepMsFromInterval(interval) {
  if (interval === '5m') return 5 * 60e3;
  if (interval === '1h') return 3600e3;
  return DAY_MS;
}

// ─────────────────────────────────────────────────────────────
// Anomaly detection
// ─────────────────────────────────────────────────────────────

function createAnomalySymbol(_scale) {
  return (val, params) => {
    if (params.seriesName.includes('ASR') && val?.[1] < LOW_ASR_THRESHOLD) {
      return 'circle';
    }
    return 'none';
  };
}

function createAnomalySymbolSize(scale) {
  return (val, params) => {
    if (params.seriesName.includes('ASR') && val?.[1] < LOW_ASR_THRESHOLD) {
      return scale === '5min' ? 3 : 5;
    }
    return 0;
  };
}

function createAnomalyItemStyle() {
  return {
    color: (params) => {
      if (params.seriesName.includes('ASR') && params.value?.[1] < LOW_ASR_THRESHOLD) {
        return '#ff3b30';
      }
      return params.color;
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Series factory
// ─────────────────────────────────────────────────────────────

export function seriesLine(name, data, xAxisIndex, yAxisIndex, color, options = {}) {
  const { area = false, smooth = true, smoothMonotone, connectNulls = false, sampling = 'lttb' } = options;

  return {
    name,
    type: 'line',
    xAxisIndex,
    yAxisIndex,
    showSymbol: false,
    ...(sampling && sampling !== 'none' ? { sampling } : {}),
    symbolSize: 6,
    connectNulls: !!connectNulls,
    smooth: typeof smooth === 'number' ? smooth : !!smooth,
    ...(smoothMonotone ? { smoothMonotone } : {}),
    lineStyle: { width: 1.8, color },
    itemStyle: { color },
    areaStyle: area ? { opacity: 0.15, color } : undefined,
    data,
    emphasis: {
      focus: 'series',
      itemStyle: { color: '#ff3b30', borderColor: '#fff', borderWidth: 2 },
      symbolSize: 10
    }
  };
}

function createCurrentSeries({ name, pairs, axisIndex, color, lineProps, stepMs }) {
  const series = seriesLine(name, withGapBreaks(pairs, stepMs), axisIndex, axisIndex, color, { ...lineProps, area: true });
  series.z = 3;
  return series;
}

function createPrevSeries({ name, pairs, axisIndex, prevProps, stepMs }) {
  const series = seriesLine(
    `${name} -24h`,
    withGapBreaks(shiftForwardPairs(pairs, DAY_MS), stepMs),
    axisIndex,
    axisIndex,
    PREV_COLOR,
    prevProps
  );

  series.emphasis = { disabled: true, scale: false };
  series.z = 1;
  series.tooltip = { show: false };
  series.silent = true;

  return series;
}

// ─────────────────────────────────────────────────────────────
// Axes builders
// ─────────────────────────────────────────────────────────────

function buildXAxes(grids, minX, maxX) {
  return grids.map((g, i) => ({
    type: 'time',
    gridIndex: i,
    min: minX,
    max: maxX,
    axisLabel: { color: '#6e7781' },
    axisLine: { lineStyle: { color: '#888' } },
    axisTick: { alignWithLabel: true },
    axisPointer: { show: true, snap: true, triggerTooltip: true, label: { show: false } }
  }));
}

function buildYAxes(grids) {
  return grids.map((g, i) => ({
    type: 'value',
    gridIndex: i,
    axisLabel: { show: false },
    splitLine: { show: false },
    axisLine: { show: false },
    axisTick: { show: false }
  }));
}

// ─────────────────────────────────────────────────────────────
// Graphic labels
// ─────────────────────────────────────────────────────────────

function buildGraphicLabels(grids) {
  return METRIC_NAMES.map((name, i) => ({
    type: 'text',
    left: 6,
    top: i === 0 ? grids[i].top + 6 : grids[i].top + 4,
    z: 10,
    style: {
      text: name,
      fill: '#6e7781',
      font: '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    }
  }));
}

// ─────────────────────────────────────────────────────────────
// Visual map config
// ─────────────────────────────────────────────────────────────

function buildVisualMaps() {
  return [
    {
      show: false,
      seriesIndex: 5,
      pieces: [
        { max: 10, color: 'rgba(255, 59, 48, 0.8)' },
        { min: 10, max: 30, color: 'rgba(255, 149, 0, 0.8)' },
        { min: 60, color: 'rgba(52, 199, 89, 0.8)' }
      ],
      outOfRange: { color: MAIN_BLUE }
    },
    {
      show: false,
      seriesIndex: 7,
      pieces: [
        { min: 5, color: 'rgba(0, 122, 255, 0.9)' },
        { min: 2, max: 5, color: 'rgba(0, 122, 255, 0.7)' }
      ],
      outOfRange: { color: MAIN_BLUE }
    }
  ];
}

// ─────────────────────────────────────────────────────────────
// Slider option builder
// ─────────────────────────────────────────────────────────────

function buildSliderOption({ pairsT, minX, maxX, interval }) {
  return {
    animation: false,
    grid: [SLIDER_GRID],
    xAxis: [{
      type: 'time',
      gridIndex: 0,
      min: minX,
      max: maxX,
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
        zoomOnMouseWheel: 'shift',
        moveOnMouseWheel: false,
        moveOnMouseMove: true
      }
    ],
    series: [{
      type: 'line',
      data: withGapBreaks(pairsT, getStepMs(interval)),
      xAxisIndex: 0,
      yAxisIndex: 0,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 1, color: MAIN_BLUE },
      areaStyle: { color: 'rgba(79,134,255,0.15)' },
      silent: true,
      animation: false
    }]
  };
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export function buildMultiOption({ data, fromTs, toTs, height, interval }) {
  const grids = computeChartGrids(height);
  const minX = Number.isFinite(fromTs) ? Number(fromTs) : null;
  const baseMaxX = Number.isFinite(toTs) ? Number(toTs) : null;
  const maxX = baseMaxX == null ? null : baseMaxX + DAY_MS;

  // prepare data pairs
  const pairsT = cleanPairs(toPairs(data?.TCalls).sort((a, b) => a[0] - b[0]));
  const pairsA = cleanPairs(toPairs(data?.ASR).sort((a, b) => a[0] - b[0]));
  const pairsM = cleanPairs(toPairs(data?.Minutes).sort((a, b) => a[0] - b[0]));
  const pairsC = cleanPairs(toPairs(data?.ACD).sort((a, b) => a[0] - b[0]));
  const allPairs = [pairsT, pairsA, pairsM, pairsC];

  // calculate visuals
  const rangeMs = estimateRangeMs(minX, baseMaxX, interval);
  const scale = detectTimeScale(rangeMs);
  const density = getPointDensity(ESTIMATED_WIDTH, pairsT.length);
  const zoomStrength = getZoomStrength(rangeMs, DAY_MS);
  const { lineWidth, smoothStrength } = getLineVisuals(zoomStrength, density, scale);

  const stepMs = getStepMsFromInterval(interval);
  const is5m = scale === '5min';

  // line props
  const lineProps = {
    area: true,
    smooth: smoothStrength,
    connectNulls: false,
    sampling: is5m ? 'none' : 'lttb',
    lineStyle: { width: lineWidth },
    symbol: createAnomalySymbol(scale),
    symbolSize: createAnomalySymbolSize(scale),
    itemStyle: createAnomalyItemStyle()
  };

  const prevProps = {
    area: false,
    smooth: smoothStrength,
    connectNulls: false,
    showSymbol: false,
    sampling: is5m ? 'none' : 'lttb',
    lineStyle: { width: 1, opacity: 0.5, type: 'dashed' }
  };

  // build series
  const currentSeries = METRIC_NAMES.map((name, i) =>
    createCurrentSeries({ name, pairs: allPairs[i], axisIndex: i, color: MAIN_BLUE, lineProps, stepMs })
  );

  const prevSeries = METRIC_NAMES.map((name, i) =>
    createPrevSeries({ name, pairs: allPairs[i], axisIndex: i, prevProps, stepMs })
  );

  // order: tcalls, prevs, then rest of current
  const series = [currentSeries[0], ...prevSeries, currentSeries[1], currentSeries[2], currentSeries[3]];

  // build main option
  const option = {
    animation: true,
    animationDurationUpdate: 200,
    animationEasingUpdate: 'cubicOut',
    grid: grids,
    xAxis: buildXAxes(grids, minX, maxX),
    yAxis: buildYAxes(grids),
    color: METRIC_NAMES.map(() => MAIN_BLUE),
    axisPointer: {
      link: [{ xAxisIndex: [0, 1, 2, 3] }],
      lineStyle: { color: '#999' },
      snap: true,
      label: { show: false }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', snap: true, label: { show: false } },
      confine: true,
      order: 'valueAsc'
    },
    dataZoom: [{
      type: 'inside',
      xAxisIndex: [0, 1, 2, 3],
      throttle: 80,
      zoomOnMouseWheel: 'shift',
      moveOnMouseWheel: false,
      moveOnMouseMove: true,
      brushSelect: false
    }],
    series,
    visualMap: buildVisualMaps()
  };

  // add graphic labels
  try {
    option.graphic = buildGraphicLabels(grids);
  } catch (e) {
    logError(ErrorCategory.CHART, 'MultiLineBuilder:graphics', e);
  }

  // build slider option
  const sliderOption = buildSliderOption({ pairsT, minX, maxX, interval });

  return { main: option, slider: sliderOption };
}
