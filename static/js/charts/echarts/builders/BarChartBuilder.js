// static/js/charts/echarts/builders/BarChartBuilder.js
// Responsibility: Build ECharts series for 4-panel bar chart
import { buildLabelOverlay } from '../helpers/labelOverlay.js';
import { chooseBarWidthPx } from '../helpers/dataTransform.js';
import { getHeatmapColor } from '../../../visualEnhancements/heatmapStyling.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';
import { detectTimeScale, getBarVisuals } from '../../../visualEnhancements/visualMapping.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAIN_COLOR = '#4f86ff';
const PREV_COLOR = 'rgba(140,148,156,0.85)';
const LOW_ASR_COLOR = 'rgba(255, 40, 40, 0.6)';
const LOW_ASR_THRESHOLD = 30;

const METRIC_CONFIG = [
  { id: 'tc', name: 'TCalls', axisIndex: 0, hasHeatmap: false },
  { id: 'as', name: 'ASR', axisIndex: 1, hasHeatmap: true },
  { id: 'mn', name: 'Minutes', axisIndex: 2, hasHeatmap: false },
  { id: 'ac', name: 'ACD', axisIndex: 3, hasHeatmap: true }
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function estimateRangeMs(interval) {
  if (interval === '5m') return 8 * 3600 * 1000;
  if (interval === '1h') return 2 * 3600 * 1000;
  return 24 * 3600 * 1000;
}

function getColorWithHeatmap(metric, val, defaultColor) {
  if (val == null || val === '') return defaultColor;

  const v = Number(val);

  // low ASR warning
  if (metric === 'ASR' && v < LOW_ASR_THRESHOLD) {
    return LOW_ASR_COLOR;
  }

  // heatmap override
  if (metric === 'ASR' || metric === 'ACD') {
    const hm = getHeatmapColor(metric, v);
    if (hm) return hm;
  }

  return defaultColor;
}

// ─────────────────────────────────────────────────────────────
// Series props factories
// ─────────────────────────────────────────────────────────────

function createCommonProps(barCategoryGap) {
  return {
    large: true,
    largeThreshold: 300,
    barGap: '15%',
    barCategoryGap,
    label: { show: false }
  };
}

function createEmphasisStyle() {
  return {
    focus: 'none',
    blurScope: 'coordinateSystem',
    itemStyle: {
      opacity: 1,
      borderColor: MAIN_COLOR,
      borderWidth: 2,
      shadowBlur: 8,
      shadowColor: 'rgba(79, 134, 255, 0.6)'
    },
    z: 10
  };
}

function createCurrentProps(common, blueWidth) {
  return {
    ...common,
    barWidth: blueWidth,
    emphasis: createEmphasisStyle(),
    blur: { itemStyle: { opacity: 1 } },
    z: 2
  };
}

function createPrevProps(common, grayWidth, grayOpacity) {
  return {
    ...common,
    barWidth: grayWidth,
    itemStyle: { color: PREV_COLOR, opacity: grayOpacity },
    emphasis: { disabled: true },
    tooltip: { show: false },
    silent: true,
    z: 1
  };
}

// ─────────────────────────────────────────────────────────────
// Series builders
// ─────────────────────────────────────────────────────────────

function createCurrentSeries({ config, currProps, blueOpacity, data }) {
  const itemStyle = config.hasHeatmap
    ? { color: (params) => getColorWithHeatmap(config.name, params.value, MAIN_COLOR), opacity: blueOpacity }
    : { color: MAIN_COLOR, opacity: blueOpacity };

  return {
    id: config.id,
    name: config.name,
    type: 'bar',
    xAxisIndex: config.axisIndex,
    yAxisIndex: config.axisIndex,
    ...currProps,
    itemStyle,
    data
  };
}

function createPrevSeries({ config, prevProps, grayOpacity, data }) {
  return {
    id: `${config.id}Prev`,
    name: `${config.name} -24h`,
    type: 'bar',
    xAxisIndex: config.axisIndex,
    yAxisIndex: config.axisIndex,
    ...prevProps,
    itemStyle: { color: PREV_COLOR, opacity: grayOpacity },
    data
  };
}

function buildMetricSeries({ config, currData, prevData, currProps, prevProps, blueOpacity, grayOpacity }) {
  return [
    createCurrentSeries({ config, currProps, blueOpacity, data: currData }),
    createPrevSeries({ config, prevProps, grayOpacity, data: prevData })
  ];
}

// ─────────────────────────────────────────────────────────────
// Overlay labels
// ─────────────────────────────────────────────────────────────

function buildOverlayLabels({ labels, centers, setsA, colorMap, stepMs, providerRows, providerKey }) {
  const tsList = centers?.length ? centers : (setsA.curr?.map(p => p[0]) || []);

  return [
    buildLabelOverlay({
      metric: 'ASR',
      timestamps: tsList,
      labels: labels?.ASR || {},
      colorMap,
      gridIndex: 1,
      xAxisIndex: 1,
      yAxisIndex: 1,
      secondary: false,
      stepMs,
      align: 'current',
      providerRows,
      providerKey
    }),
    buildLabelOverlay({
      metric: 'ACD',
      timestamps: tsList,
      labels: labels?.ACD || {},
      colorMap,
      gridIndex: 3,
      xAxisIndex: 3,
      yAxisIndex: 3,
      secondary: false,
      stepMs,
      align: 'current',
      providerRows,
      providerKey
    })
  ];
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export function buildBarSeries({ setsT, setsA, setsM, setsC, centers, interval, stepMs, labels, colorMap, providerRows, providerKey }) {
  const bw = chooseBarWidthPx(interval);
  const rangeMs = estimateRangeMs(interval);
  const scale = detectTimeScale(rangeMs);

  const { blueOpacity, grayOpacity, blueWidth, grayWidth } = getBarVisuals(bw, scale);
  const barCategoryGap = bw < 4 ? '0%' : '20%';

  const common = createCommonProps(barCategoryGap);
  const currProps = createCurrentProps(common, blueWidth);
  const prevProps = createPrevProps(common, grayWidth, grayOpacity);

  // map data sets to configs
  const dataSets = [setsT, setsA, setsM, setsC];

  // build all metric series
  const series = METRIC_CONFIG.flatMap((config, i) =>
    buildMetricSeries({
      config,
      currData: dataSets[i].curr,
      prevData: dataSets[i].prev,
      currProps,
      prevProps,
      blueOpacity,
      grayOpacity
    })
  );

  // add overlay labels
  try {
    const overlays = buildOverlayLabels({ labels, centers, setsA, colorMap, stepMs, providerRows, providerKey });
    series.push(...overlays);
  } catch (e) {
    logError(ErrorCategory.CHART, 'BarChartBuilder:overlays', e);
  }

  return series;
}
