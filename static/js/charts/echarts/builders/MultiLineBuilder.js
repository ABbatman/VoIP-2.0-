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

  const conn = false;
  const is5m = interval === '5m';
  // Disable sampling on 5m to avoid losing short pulses; keep LTTB for coarser steps
  const samp = is5m ? 'none' : 'lttb';
  const smoothVal = true;
  const smoothMono = undefined;

  const stepMs = (interval === '5m') ? 5 * 60e3 : (interval === '1h' ? 3600e3 : 24 * 3600e3);
  const pairsT = toPairs(data?.TCalls).sort((a,b) => a[0]-b[0]);
  const pairsA = toPairs(data?.ASR).sort((a,b) => a[0]-b[0]);
  const pairsM = toPairs(data?.Minutes).sort((a,b) => a[0]-b[0]);
  const pairsC = toPairs(data?.ACD).sort((a,b) => a[0]-b[0]);

  const tcalls = seriesLine('TCalls', pairsT, 0, 0, colors.TCalls, { area: true, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: conn, sampling: samp });
  const asr = seriesLine('ASR', pairsA, 1, 1, colors.ASR, { area: true, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: conn, sampling: samp });
  const minutes = seriesLine('Minutes', pairsM, 2, 2, colors.Minutes, { area: true, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: conn, sampling: samp });
  const acd = seriesLine('ACD', pairsC, 3, 3, colors.ACD, { area: true, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: conn, sampling: samp });
  tcalls.z = 3; asr.z = 3; minutes.z = 3; acd.z = 3;

  const prevColor = 'rgba(140,148,156,0.85)';
  const prevSamp = is5m ? 'none' : samp;
  const prevConn = is5m ? true : false;
  const tcallsPrev = seriesLine('TCalls -24h', withGapBreaks(shiftForwardPairs(pairsT, dayMs), stepMs), 0, 0, prevColor, { area: false, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: prevConn, showSymbol: false, sampling: prevSamp });
  const asrPrev = seriesLine('ASR -24h', withGapBreaks(shiftForwardPairs(pairsA, dayMs), stepMs), 1, 1, prevColor, { area: false, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: prevConn, showSymbol: false, sampling: prevSamp });
  const minutesPrev = seriesLine('Minutes -24h', withGapBreaks(shiftForwardPairs(pairsM, dayMs), stepMs), 2, 2, prevColor, { area: false, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: prevConn, showSymbol: false, sampling: prevSamp });
  const acdPrev = seriesLine('ACD -24h', withGapBreaks(shiftForwardPairs(pairsC, dayMs), stepMs), 3, 3, prevColor, { area: false, smooth: smoothVal, smoothMonotone: smoothMono, connectNulls: prevConn, showSymbol: false, sampling: prevSamp });
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
    xAxis: xAxes,
    yAxis: yAxes,
    color: Object.values(colors),
    axisPointer: { link: [{ xAxisIndex: [0, 1, 2, 3] }], lineStyle: { color: '#999' }, snap: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross', snap: true }, confine: true, order: 'valueAsc' },
    dataZoom: [
      { type: 'inside', xAxisIndex: [0,1,2,3], throttle: 80, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true, brushSelect: false },
      { type: 'slider', xAxisIndex: 0, height: 32, bottom: 6, throttle: 80, showDataShadow: true, dataBackground: { lineStyle: { color: MAIN_BLUE, width: 1 }, areaStyle: { color: 'rgba(79,134,255,0.18)' } } }
    ],
    series: [tcalls, tcallsPrev, asrPrev, minutesPrev, acdPrev, asr, minutes, acd],
  };

  try {
    const labels = axisNames.map((name, i) => {
      const isFirst = i === 0;
      const y = isFirst ? (grids[i].top + 6) : (grids[i].top + 4);
      return { type: 'text', left: 6, top: y, z: 10, style: { text: name, fill: '#6e7781', font: '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif' } };
    });
    option.graphic = (option.graphic || []).concat(labels);
  } catch(_) {}

  return option;
}
