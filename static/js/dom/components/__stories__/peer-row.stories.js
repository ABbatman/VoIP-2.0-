// static/js/dom/components/__stories__/peer-row.stories.js
import { renderPeerRowString } from '../../table-renderers.js';

export default { title: 'Table/PeerRow' };

const samplePeer = {
  main: 'Customer A',
  peer: 'Supplier X',
  destination: 'Ethiopia Mobile',
  Min: 80, YMin: 60, Min_delta: 20,
  ACD: 2.2, YACD: 2.5, ACD_delta: -0.3,
  ASR: 29, YASR: 30, ASR_delta: -1,
  SCall: 300, YSCall: 280, SCall_delta: 20,
  TCall: 600, YTCall: 580, TCall_delta: 20,
  PDD: 95, ATime: 180
};

export const Default = () => {
  const html = renderPeerRowString(samplePeer, { mainGroupId: 'main-1', peerGroupId: 'peer-1', isMainGroupOpen: true, isPeerGroupOpen: false });
  return `<table class="results-display__table"><tbody>${html}</tbody></table>`;
};
