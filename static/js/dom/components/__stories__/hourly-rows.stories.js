// static/js/dom/components/__stories__/hourly-rows.stories.js
import { renderHourlyRowsString } from '../../table-renderers.js';

export default { title: 'Table/HourlyRows' };

const parentPeer = { peer: 'Supplier X', destination: 'Ethiopia Mobile' };
const hours = [
  { time: '2025-09-29 10:00', Min: 10, YMin: 8, Min_delta: 2, ACD: 2.1, YACD: 2.3, ACD_delta: -0.2, ASR: 30, YASR: 32, ASR_delta: -2, SCall: 30, YSCall: 28, SCall_delta: 2, TCall: 60, YTCall: 58, TCall_delta: 2 },
  { time: '2025-09-29 11:00', Min: 12, YMin: 9, Min_delta: 3, ACD: 2.3, YACD: 2.5, ACD_delta: -0.2, ASR: 31, YASR: 33, ASR_delta: -2, SCall: 31, YSCall: 29, SCall_delta: 2, TCall: 61, YTCall: 59, TCall_delta: 2 }
];

export const Expanded = () => {
  const html = renderHourlyRowsString(hours, { peerGroupId: 'peer-1', isMainGroupOpen: true, isPeerGroupOpen: true, parentPeer });
  return `<table class="results-display__table"><tbody>${html}</tbody></table>`;
};
