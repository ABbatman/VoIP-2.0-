// static/js/charts/echarts/builders/MultiLineBuilder.js
// Build option for multi-line ECharts chart (no zoom policy, no tooltip formatter)
import { toPairs, withGapBreaks, shiftForwardPairs } from '../helpers/dataTransform.js';
import { MAIN_BLUE } from '../helpers/colors.js';

function computeGrids(heightPx) {
  const topPad = 8;
  const bottomPad = 20; // Reverted to small padding as slider is external
  const gap = 8;
  const usable = Math.max(160, (heightPx || 600) - topPad - bottomPad - gap * 3);
  const h = Math.floor(usable / 4);
  const grids = Array.from({ length: 4 }, (_, i) => ({
    left: 40,
    right: 16,
    top: topPad + i * (h + gap),
    height: h,
  }));
  return grids;
}

function computeSliderGrid() {
  return { left: 40, right: 16, top: 4, bottom: 4, height: 40 };
}

export function seriesLine(name, data, xAxisIndex, yAxisIndex, color, { area = false, smooth = true, smoothMonotone = undefined, connectNulls = false, sampling = 'lttb' } = {}) {
  return {
    name,
    type: 'line',
    xAxisIndex,
    yAxisIndex,
    showSymbol: false,
    ...(sampling && sampling !== 'none' ? { sampling } : {}),
    symbolSize: 0,
    connectNulls: !!connectNulls,
    smooth: (typeof smooth === 'number' ? smooth : !!smooth),
    ...(smoothMonotone ? { smoothMonotone } : {}),
    lineStyle: { width: 1.8, color },
    areaStyle: area ? { opacity: 0.15, color } : undefined,
    data,
    emphasis: { focus: 'series' },
  };
}

import { detectTimeScale, getLineVisuals, getZoomStrength, getPointDensity } from '../../../visualEnhancements/visualMapping.js';

// ... (imports)

export function buildMultiOption({ data, fromTs, toTs, height, interval }) {
  const grids = computeGrids(height);
  const dayMs = 24 * 3600e3;
  const minX = Number.isFinite(fromTs) ? Number(fromTs) : null;
  const baseMaxX = Number.isFinite(toTs) ? Number(toTs) : null;
  const maxX = baseMaxX == null ? null : (baseMaxX + dayMs);

  const xAxes = grids.map((g, i) => ({
    type: 'time', gridIndex: i, min: minX, max: maxX,
    axisLabel: { color: '#6e7781' }, axisLine: { lineStyle: { color: '#888' } }, axisTick: { alignWithLabel: true },
    axisPointer: { show: true, snap: true, triggerTooltip: true }
  }));

  const axisNames = ['TCalls', 'ASR', 'Minutes', 'ACD'];
  const yAxes = grids.map((g, i) => ({
    type: 'value',
    gridIndex: i,
    axisLabel: { show: false },
    splitLine: { show: false },
    axisLine: { lineStyle: { color: '#000' } }
  }));

  const colors = {
    TCalls: MAIN_BLUE,
    ASR: MAIN_BLUE,
    Minutes: MAIN_BLUE,
    ACD: MAIN_BLUE,
  };

  // 1. Scale & Adaptive Logic
  // Filter out explicit nulls first to allow "smart connection" of small gaps
  const cleanPairs = (p) => (p || []).filter(d => d[1] != null);

  const pairsT = cleanPairs(toPairs(data?.TCalls).sort((a, b) => a[0] - b[0]));
  const pairsA = cleanPairs(toPairs(data?.ASR).sort((a, b) => a[0] - b[0]));
  const pairsM = cleanPairs(toPairs(data?.Minutes).sort((a, b) => a[0] - b[0]));
  const pairsC = cleanPairs(toPairs(data?.ACD).sort((a, b) => a[0] - b[0]));

  // Estimate rangeMs
  let rangeMs = 24 * 3600 * 1000;
  if (minX != null && baseMaxX != null) {
    rangeMs = baseMaxX - minX;
  } else if (interval === '5m') {
    rangeMs = 8 * 3600 * 1000;
  } else if (interval === '1h') {
    rangeMs = 2 * 3600 * 1000;
  }

  const scale = detectTimeScale(rangeMs);

  // Calculate Visuals
  // Estimate width (approx 300px per grid if not known, or use height * aspect)
  // Since we don't have width, we assume a standard density or use data count directly
  const dataCount = pairsT.length;
  const estimatedWidth = 800; // default
  const density = getPointDensity(estimatedWidth, dataCount);
  const zoomStrength = getZoomStrength(rangeMs, 24 * 3600 * 1000); // normalized against daily

  const { lineWidth, smoothStrength } = getLineVisuals(zoomStrength, density, scale);

  // Anomaly Highlighting (Red dot for low ASR)
  const anomalySymbol = (val, params) => {
    if (params.seriesName.includes('ASR') && val && val[1] < 30) {
      return 'circle';
    }
    return 'none'; // default no symbol
  };
  const anomalySymbolSize = (val, params) => {
    if (params.seriesName.includes('ASR') && val && val[1] < 30) {
      return scale === '5min' ? 3 : 5; // tiny dot for 5m, larger for others
    }
    return 0;
  };
  const anomalyItemStyle = {
    color: (params) => {
      if (params.seriesName.includes('ASR') && params.value && params.value[1] < 30) {
        return '#ff3b30'; // Red
      }
      return params.color;
    }
  };

  // Common line props
  const stepMs = (interval === '5m') ? 5 * 60e3 : (interval === '1h' ? 3600e3 : 24 * 3600e3);
  const is5m = scale === '5min';
  const conn = false; // Disable global connectNulls, rely on withGapBreaks
  const samp = is5m ? 'none' : 'lttb';

  const lineProps = {
    area: true,
    smooth: smoothStrength,
    connectNulls: conn,
    sampling: samp,
    lineStyle: { width: lineWidth },
    symbol: anomalySymbol,
    symbolSize: anomalySymbolSize,
    itemStyle: anomalyItemStyle
  };

  // Apply withGapBreaks to Blue series too (Smart Gaps)
  const tcalls = seriesLine('TCalls', withGapBreaks(pairsT, stepMs), 0, 0, colors.TCalls, { ...lineProps, area: true });
  const asr = seriesLine('ASR', withGapBreaks(pairsA, stepMs), 1, 1, colors.ASR, { ...lineProps, area: true });
  const minutes = seriesLine('Minutes', withGapBreaks(pairsM, stepMs), 2, 2, colors.Minutes, { ...lineProps, area: true });
  const acd = seriesLine('ACD', withGapBreaks(pairsC, stepMs), 3, 3, colors.ACD, { ...lineProps, area: true });
  tcalls.z = 3; asr.z = 3; minutes.z = 3; acd.z = 3;

  const prevColor = 'rgba(140,148,156,0.85)';
  const prevSamp = is5m ? 'none' : samp;
  const prevConn = is5m ? true : false;

  // Prev lines: thinner, no symbols, lower opacity
  const prevProps = {
    area: false,
    smooth: smoothStrength,
    connectNulls: conn, // Use same logic
    showSymbol: false,
    sampling: prevSamp,
    lineStyle: { width: 1, opacity: 0.5, type: 'dashed' }
  };

  const tcallsPrev = seriesLine('TCalls -24h', withGapBreaks(shiftForwardPairs(pairsT, dayMs), stepMs), 0, 0, prevColor, prevProps);
  const asrPrev = seriesLine('ASR -24h', withGapBreaks(shiftForwardPairs(pairsA, dayMs), stepMs), 1, 1, prevColor, prevProps);
  const minutesPrev = seriesLine('Minutes -24h', withGapBreaks(shiftForwardPairs(pairsM, dayMs), stepMs), 2, 2, prevColor, prevProps);
  const acdPrev = seriesLine('ACD -24h', withGapBreaks(shiftForwardPairs(pairsC, dayMs), stepMs), 3, 3, prevColor, prevProps);

  tcallsPrev.emphasis = { disabled: true };
  asrPrev.emphasis = { disabled: true };
  minutesPrev.emphasis = { disabled: true };
  acdPrev.emphasis = { disabled: true };
  tcallsPrev.hoverAnimation = false; asrPrev.hoverAnimation = false; minutesPrev.hoverAnimation = false; acdPrev.hoverAnimation = false;
  tcallsPrev.z = 1; asrPrev.z = 1; minutesPrev.z = 1; acdPrev.z = 1;
  tcallsPrev.tooltip = { show: false }; tcallsPrev.silent = true;
  asrPrev.tooltip = { show: false }; asrPrev.silent = true;
  minutesPrev.tooltip = { show: false }; minutesPrev.silent = true;
  acdPrev.tooltip = { show: false }; acdPrev.silent = true;

  const option = {
    animation: true,
    animationDurationUpdate: 200,
    animationEasingUpdate: 'cubicOut',
    grid: grids,
    xAxis: xAxes.map(x => ({ ...x, axisPointer: { ...x.axisPointer, label: { show: false }, triggerTooltip: false } })),
    yAxis: yAxes.map(y => ({ ...y, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } })),
    color: Object.values(colors),
    axisPointer: { link: [{ xAxisIndex: [0, 1, 2, 3] }], lineStyle: { color: '#999' }, snap: true, label: { show: false } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross', snap: true, label: { show: false } }, confine: true, order: 'valueAsc' },
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2, 3], throttle: 80, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true, brushSelect: false },
      { type: 'slider', xAxisIndex: 0, height: 32, bottom: 6, throttle: 80, showDataShadow: true, dataBackground: { lineStyle: { color: MAIN_BLUE, width: 1 }, areaStyle: { color: 'rgba(79,134,255,0.18)' } } }
    ],
    series: [tcalls, tcallsPrev, asrPrev, minutesPrev, acdPrev, asr, minutes, acd],
    visualMap: [
      {
        show: false,
        seriesIndex: 5, // ASR
        pieces: [
          { max: 10, color: 'rgba(255, 59, 48, 0.8)' },
          { min: 10, max: 30, color: 'rgba(255, 149, 0, 0.8)' },
          { min: 60, color: 'rgba(52, 199, 89, 0.8)' }
        ],
        outOfRange: { color: MAIN_BLUE }
      },
      {
        show: false,
        seriesIndex: 7, // ACD
        pieces: [
          { min: 5, color: 'rgba(0, 122, 255, 0.9)' },
          { min: 2, max: 5, color: 'rgba(0, 122, 255, 0.7)' }
        ],
        outOfRange: { color: MAIN_BLUE }
      }
    ],
  };

  try {
    const labels = axisNames.map((name, i) => {
      const isFirst = i === 0;
      const y = isFirst ? (grids[i].top + 6) : (grids[i].top + 4);
      return { type: 'text', left: 6, top: y, z: 10, style: { text: name, fill: '#6e7781', font: '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif' } };
    });
    option.graphic = (option.graphic || []).concat(labels);
  } catch (_) { }

  // Slider Option
  const sliderGrid = computeSliderGrid();
  const sliderXAxis = {
    type: 'time', gridIndex: 0, min: minX, max: maxX,
    axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }
  };
  const sliderYAxis = { type: 'value', gridIndex: 0, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false } };

  const sliderOption = {
    animation: false,
    grid: [sliderGrid],
    xAxis: [sliderXAxis],
    yAxis: [sliderYAxis],
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 32,
        bottom: 8,
        throttle: 80,
        backgroundColor: 'rgba(0,0,0,0)',
        fillerColor: 'rgba(79,134,255,0.12)',
        showDataShadow: true,
        dataBackground: { lineStyle: { color: MAIN_BLUE, width: 1 }, areaStyle: { color: 'rgba(79,134,255,0.18)' } }
      },
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: 'shift',
        moveOnMouseWheel: false,
        moveOnMouseMove: true
      }
    ],
    series: [
      {
        type: 'line',
        data: pairsT, // Use TCalls for background
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1, color: '#ddd' },
        areaStyle: { color: '#eee' },
        silent: true,
        animation: false
      }
    ]
  };

  // Cleanup main option dataZoom
  option.dataZoom = [
    { type: 'inside', xAxisIndex: [0, 1, 2, 3], throttle: 80, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true, brushSelect: false }
  ];

  return { main: option, slider: sliderOption };
}
