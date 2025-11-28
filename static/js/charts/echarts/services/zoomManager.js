// static/js/charts/echarts/services/zoomManager.js
// Centralized zoom range management and policy
import { toast } from '../../../ui/notify.js';
import {
  getChartsZoomRange,
  setChartsZoomRange,
  getChartsCurrentInterval,
  setChartsCurrentInterval
} from '../../../state/runtimeFlags.js';
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

function _getModelRange(chart) {
  try {
    const model = chart.getModel();
    const xa = model && model.getComponent('xAxis', 0);
    const scale = xa && xa.axis && xa.axis.scale;
    if (scale && typeof scale.getExtent === 'function') {
      const ext = scale.getExtent();
      const fromTs = Math.floor(ext[0]);
      const toTs = Math.ceil(ext[1]);
      if (Number.isFinite(fromTs) && Number.isFinite(toTs) && toTs > fromTs) return { fromTs, toTs };
    }
  } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
  return null;
}

// local cache for policy throttle
let _zoomPolicyLastSwitchTs = 0;

export function getRange() {
  return getChartsZoomRange();
}

export function setRange(range) {
  setChartsZoomRange(range);
}

export function applyRange(chart) {
  // Guard against disposed chart
  if (!chart || (chart.isDisposed && chart.isDisposed())) return;
  // apply global zoom range to existing dataZoom components only (do not add new ones)
  try {
    const zr = getRange();
    if (!zr || !Number.isFinite(zr.fromTs) || !Number.isFinite(zr.toTs) || zr.toTs <= zr.fromTs) return;
    const opt = chart.getOption();
    const existing = opt && opt.dataZoom;
    if (!Array.isArray(existing) || existing.length === 0) return;
    // update only existing dataZoom components
    const updates = existing.map(() => ({ startValue: zr.fromTs, endValue: zr.toTs }));
    chart.setOption({ dataZoom: updates }, { lazyUpdate: true });
  } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
}

export function attach(chart, { onZoom } = {}) {
  // Guard against disposed chart
  if (!chart || (chart.isDisposed && chart.isDisposed())) return;
  // attach unified dataZoom listener to persist and enforce policies
  try { chart.off('dataZoom'); } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
  chart.on('dataZoom', () => {
    const zr = _getModelRange(chart);
    if (zr) {
      setRange(zr);
      // 5m interval hard policy: auto-switch to 1h when zoom > 5 days
      try {
        const diffDays = (zr.toTs - zr.fromTs) / (24 * 3600e3);
        const curInt = getChartsCurrentInterval();
        if (curInt === '5m' && Number.isFinite(diffDays) && diffDays > 5.0001) {
          const now = Date.now();
          if (now - _zoomPolicyLastSwitchTs > 600) {
            _zoomPolicyLastSwitchTs = now;
            try { toast('5-minute interval is available only for ranges up to 5 days. Switching to 1 hour.', { type: 'warning', duration: 3500 }); } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
            setChartsCurrentInterval('1h');
            try {
              import('../../../state/eventBus.js').then(({ publish }) => {
                try { publish('charts:intervalChanged', { interval: '1h' }); } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
              }).catch(() => {});
            } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
          }
        }
      } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
      try { if (typeof onZoom === 'function') onZoom(zr); } catch(e) { logError(ErrorCategory.CHART, 'zoomManager', e); }
    }
  });
}
