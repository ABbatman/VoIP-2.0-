// static/js/charts/echarts/helpers/format.js
// number/date formatters (no UI side-effects)
export const formatInt = (v) => (v == null || isNaN(v) ? '-' : Math.round(Number(v)).toLocaleString());
export const formatFixed1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(Number(v) * 10) / 10).toFixed(1));
export const formatPercent1 = (v) => (v == null || isNaN(v) ? '-' : `${(Math.round(Number(v) * 10) / 10).toFixed(1)}%`);
export const formatDateTime = (ts) => {
  try { return new Date(Number(ts)).toISOString().slice(0,16).replace('T',' '); } catch(_) { return ''; }
};
