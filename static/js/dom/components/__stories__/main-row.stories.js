// static/js/dom/components/__stories__/main-row.stories.js
import { renderMainRowString } from '../../table-renderers.js';

export default { title: 'Table/MainRow' };

const sampleMain = {
  main: 'Customer A',
  destination: 'Ethiopia Mobile',
  Min: 120, YMin: 100, Min_delta: 20,
  ACD: 2.54, YACD: 2.75, ACD_delta: -0.21,
  ASR: 32, YASR: 35, ASR_delta: -3,
  SCall: 450, YSCall: 430, SCall_delta: 20,
  TCall: 900, YTCall: 880, TCall_delta: 20,
  PDD: 100, ATime: 200
};

export const Default = () => `<table><tbody>${renderMainRowString(sampleMain, { mainGroupId: 'main-1', isMainGroupOpen: false })}</tbody></table>`;
