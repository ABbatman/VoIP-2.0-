// static/js/charts/echarts/builders/BarChartBuilder.js
// Build ECharts series for 4-panel bar chart (bars + prev + overlays)
import { buildLabelOverlay } from '../helpers/labelOverlay.js';
import { chooseBarWidthPx } from '../helpers/dataTransform.js';

export function buildBarSeries({ setsT, setsA, setsM, setsC, centers, interval, stepMs, labels, colorMap, providerRows, providerKey }) {
  // move logic: only assemble series from prepared data
  const bw = chooseBarWidthPx(interval);
  const colorMain = '#4f86ff';
  const colors = { TCalls: colorMain, ASR: colorMain, Minutes: colorMain, ACD: colorMain };
  const list = [];
  // bars (single path)
  list.push({ id: 'tc', name: 'TCalls', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.TCalls }, data: setsT.curr });
  list.push({ id: 'tcPrev', name: 'TCalls -24h', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsT.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
  list.push({ id: 'as', name: 'ASR', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.ASR }, data: setsA.curr });
  list.push({ id: 'asPrev', name: 'ASR -24h', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsA.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
  list.push({ id: 'mn', name: 'Minutes', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.Minutes }, data: setsM.curr });
  list.push({ id: 'mnPrev', name: 'Minutes -24h', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsM.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
  list.push({ id: 'ac', name: 'ACD', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', emphasis: { focus: 'series', blurScope: 'coordinateSystem' }, blur: { itemStyle: { opacity: 0.12 } }, itemStyle: { color: colors.ACD }, data: setsC.curr });
  list.push({ id: 'acPrev', name: 'ACD -24h', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, barWidth: bw, barGap: '4%', barCategoryGap: '20%', itemStyle: { color: 'rgba(140,148,156,0.85)' }, data: setsC.prev, emphasis: { disabled: true }, tooltip: { show: false }, silent: true, blur: { itemStyle: { opacity: 0.4 } } });
  // preview (slider) before overlays
  list.push({ id: 'preview', name: 'Preview', type: 'bar', xAxisIndex: 4, yAxisIndex: 4, large: true, largeThreshold: 300, label: { show: false, formatter: (item) => { /* no label for missing */ if (item.value === undefined || item.value === null || item.value === '') { return ''; } return Number(item.value).toFixed(1); } }, silent: true, barWidth: Math.max(1, Math.floor(bw * 0.66)), itemStyle: { color: '#4f86ff', opacity: 0.45 }, emphasis: { disabled: true }, tooltip: { show: false }, data: setsT.curr });
  // overlay labels (single call per metric) appended last
  try {
    const labelsASR = (labels && labels.ASR) || {};
    const labelsACD = (labels && labels.ACD) || {};
    const tsList = Array.isArray(centers) && centers.length ? centers : (Array.isArray(setsA.curr) ? setsA.curr.map(p => p[0]) : []);
    list.push(buildLabelOverlay({ metric: 'ASR', timestamps: tsList, labels: labelsASR, colorMap, gridIndex: 1, xAxisIndex: 1, yAxisIndex: 1, secondary: false, stepMs, align: 'current', providerRows, providerKey }));
    list.push(buildLabelOverlay({ metric: 'ACD', timestamps: tsList, labels: labelsACD, colorMap, gridIndex: 3, xAxisIndex: 3, yAxisIndex: 3, secondary: false, stepMs, align: 'current', providerRows, providerKey }));
  } catch(_) { /* overlay labels */ }
  return list;
}
