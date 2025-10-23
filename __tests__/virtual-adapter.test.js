// __tests__/virtual-adapter.test.js
// Ensures VirtualTableAdapter.renderTableRow returns ONLY <td> cells (no nested <tr>)

import { VirtualTableAdapter } from '../static/js/virtual/virtual-adapter.js';

function makeRow(level, extra = {}) {
  return {
    level,
    main: 'MAIN',
    peer: 'PEER',
    destination: 'DEST',
    Min: 10,
    ACD: 1.5,
    ASR: 40,
    SCall: 2,
    TCall: 3,
    PDD: 120,
    ATime: 30,
    YMin: 8,
    YACD: 1.0,
    YASR: 35,
    YSCall: 1,
    YTCall: 2,
    ...extra,
  };
}

describe('VirtualTableAdapter.renderTableRow', () => {
  test('main row does not include <tr> wrapper and contains td cells', () => {
    const adapter = new VirtualTableAdapter();
    const html = adapter.renderTableRow(makeRow(0, { groupId: 'main-1' }));
    expect(html).toEqual(expect.any(String));
    expect(html).not.toMatch(/<\s*tr/i);
    expect(html).toMatch(/<\s*td/i);
  });

  test('peer row does not include <tr> wrapper and contains td cells', () => {
    const adapter = new VirtualTableAdapter();
    const html = adapter.renderTableRow(makeRow(1, { groupId: 'peer-1' }));
    expect(html).toEqual(expect.any(String));
    expect(html).not.toMatch(/<\s*tr/i);
    expect(html).toMatch(/<\s*td/i);
  });

  test('hourly row does not include <tr> wrapper and contains td cells', () => {
    const adapter = new VirtualTableAdapter();
    const html = adapter.renderTableRow(makeRow(2, { groupId: 'hour-1', date: new Date().toISOString() }));
    expect(html).toEqual(expect.any(String));
    expect(html).not.toMatch(/<\s*tr/i);
    expect(html).toMatch(/<\s*td/i);
  });
});
