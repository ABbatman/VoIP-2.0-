// static/js/charts/echarts/builders/MultiLineBuilder.js
// Build option for multi-line ECharts chart (no zoom policy, no tooltip formatter)
import { toPairs, withGapBreaks, shiftForwardPairs } from '../helpers/dataTransform.js';
import { MAIN_BLUE } from '../helpers/colors.js';

function computeGrids(heightPx) {
  const topPad = 8;
  const bottomPad = 76; // space for slider dataZoom
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

import { detectTimeScale, getLineVisuals, getZoomStrength, getPointDensity, calculateTrendPercent } from '../../../visualEnhancements/visualMapping.js';

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
  const pairsT = toPairs(data?.TCalls).sort((a, b) => a[0] - b[0]);
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

  const pairsA = toPairs(data?.ASR).sort((a, b) => a[0] - b[0]);
  const pairsM = toPairs(data?.Minutes).sort((a, b) => a[0] - b[0]);
  const pairsC = toPairs(data?.ACD).sort((a, b) => a[0] - b[0]);

  // Common line props
  const stepMs = (interval === '5m') ? 5 * 60e3 : (interval === '1h' ? 3600e3 : 24 * 3600e3);
  const is5m = scale === '5min';
  const conn = false;
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

  const tcalls = seriesLine('TCalls', pairsT, 0, 0, colors.TCalls, { ...lineProps, area: true });
  const asr = seriesLine('ASR', pairsA, 1, 1, colors.ASR, { ...lineProps, area: true });
  const minutes = seriesLine('Minutes', pairsM, 2, 2, colors.Minutes, { ...lineProps, area: true });
  const acd = seriesLine('ACD', pairsC, 3, 3, colors.ACD, { ...lineProps, area: true });
  tcalls.z = 3; asr.z = 3; minutes.z = 3; acd.z = 3;

  const prevColor = 'rgba(140,148,156,0.85)';
  const prevSamp = is5m ? 'none' : samp;
  const prevConn = is5m ? true : false;

  // Prev lines: thinner, no symbols, lower opacity
  const prevProps = {
    area: false,
    smooth: smoothStrength,
    connectNulls: prevConn,
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

  // 2. Trend-based Segment Tinting (Overlay Approach)
  // VisualMap on custom dimension is not supported for line style in this ECharts version.
  // We use overlay series for Green (>10%) and Red (<-10%) segments.

  const buildTrendOverlays = (name, pairs, xIdx, yIdx) => {
    const greenData = [];
    const redData = [];

    // We need continuous segments.
    // If i-1 -> i is Green, we add i-1 and i to Green Data.
    // To prevent connecting non-adjacent green segments, we insert nulls.

    let inGreen = false;
    let inRed = false;

    for (let i = 1; i < pairs.length; i++) {
      const prev = pairs[i - 1];
      const curr = pairs[i];
      const trend = calculateTrendPercent(curr[1], prev[1]);

      // Green: > 10%
      if (trend > 10) {
        if (!inGreen) {
          greenData.push([prev[0], prev[1]]); // Start segment
          inGreen = true;
        }
        greenData.push([curr[0], curr[1]]);
      } else {
        if (inGreen) {
          // If we stop being green, we need to break the line.
          greenData.push(null); // Break
          inGreen = false;
        }
      }

      // Red: < -10%
      if (trend < -10) {
        if (!inRed) {
          redData.push([prev[0], prev[1]]);
          inRed = true;
        }
        redData.push([curr[0], curr[1]]);
      } else {
        if (inRed) {
          redData.push(null);
          inRed = false;
        }
      }
    }

    // Common props for overlays
    const overlayProps = {
      type: 'line',
      xAxisIndex: xIdx,
      yAxisIndex: yIdx,
      showSymbol: false,
      smooth: smoothStrength,
      connectNulls: false,
      lineStyle: { width: lineWidth + 1 }, // Slightly wider to cover base
      z: 10,
      silent: true,
      animation: false,
      tooltip: { show: false }
    };

    const gSeries = {
      ...overlayProps,
      name: `${name} - Trend Up`,
      data: greenData,
      lineStyle: { ...overlayProps.lineStyle, color: 'rgba(50,190,70, 0.5)' } // Fixed opacity for performance
    };

    const rSeries = {
      ...overlayProps,
      name: `${name} - Trend Down`,
      data: redData,
      lineStyle: { ...overlayProps.lineStyle, color: 'rgba(230,60,50, 0.5)' }
    };

    return [gSeries, rSeries];
  };

  const [tGreen, tRed] = buildTrendOverlays('TCalls', pairsT, 0, 0);
  const [aGreen, aRed] = buildTrendOverlays('ASR', pairsA, 1, 1);
  const [mGreen, mRed] = buildTrendOverlays('Minutes', pairsM, 2, 2);
  const [cGreen, cRed] = buildTrendOverlays('ACD', pairsC, 3, 3);

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
    series: [
      tcalls, tcallsPrev, tGreen, tRed,
      asrPrev, minutesPrev, acdPrev,
      asr, aGreen, aRed,
      minutes, mGreen, mRed,
      acd, cGreen, cRed
    ],
    // VisualMap removed
  };

  try {
    const labels = axisNames.map((name, i) => {
      const isFirst = i === 0;
      return { type: 'text', left: 6, top: y, z: 10, style: { text: name, fill: '#6e7781', font: '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif' } };
    });
    option.graphic = (option.graphic || []).concat(labels);
  } catch (_) { }

  return option;
}
