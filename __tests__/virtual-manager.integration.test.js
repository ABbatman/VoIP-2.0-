// __tests__/virtual-manager.integration.test.js
// jsdom integration: init -> render -> destroy flow for VirtualManager

jest.mock('../static/js/dom/table-ui.js', () => ({
  renderTableHeader: jest.fn(),
  renderTableFooter: jest.fn(),
  updateSortArrows: jest.fn(),
}));

jest.mock('../static/js/state/tableState.js', () => ({
  getState: jest.fn(() => ({
    multiSort: [],
    textFields: ['main', 'peer', 'destination'],
    columnFilters: {},
    globalFilterQuery: '',
  })),
  toggleYColumnsVisible: jest.fn(),
  areYColumnsVisible: jest.fn(() => false),
  setMultiSort: jest.fn(),
}));

jest.mock('../static/js/data/tableProcessor.js', () => ({
  getProcessedData: jest.fn(() => ({ pagedData: [1] })),
}));

jest.mock('../static/js/state/eventBus.js', () => ({
  subscribe: jest.fn(() => () => {}),
}));

jest.mock('../static/js/dom/hideYColumns.js', () => ({
  getYColumnToggleIcon: jest.fn(() => ''),
}));

import { VirtualManager } from '../static/js/virtual/virtual-manager.js';

function setupDOM() {
  document.body.innerHTML = `
    <div id="virtual-scroll-container" style="height:400px; overflow:auto;">
      <table id="summaryTable" class="results-display__table" style="width:800px">
        <thead id="tableHead"></thead>
        <tbody id="tableBody"></tbody>
        <tfoot></tfoot>
      </table>
      <div id="virtual-scroll-spacer"></div>
    </div>
  `;
}

function sampleData() {
  const mainRows = [
    { main: 'A', destination: 'X', Min: 10, ACD: 1.2, ASR: 40, SCall: 2, TCall: 3 },
    { main: 'B', destination: 'Y', Min: 20, ACD: 1.5, ASR: 45, SCall: 3, TCall: 5 },
  ];
  const peerRows = [
    { main: 'A', peer: 'PA', destination: 'X', Min: 5, ACD: 1.1, ASR: 42, SCall: 1, TCall: 2 },
    { main: 'B', peer: 'PB', destination: 'Y', Min: 12, ACD: 1.6, ASR: 47, SCall: 2, TCall: 3 },
  ];
  const hourlyRows = [
    { main: 'A', peer: 'PA', destination: 'X', date: new Date().toISOString(), Min: 1, ACD: 1.0, ASR: 40, SCall: 1, TCall: 1 },
  ];
  return { mainRows, peerRows, hourlyRows };
}

describe('VirtualManager integration (jsdom)', () => {
  test('initialize -> render -> destroy cleans up floating header', async () => {
    setupDOM();
    const vm = new VirtualManager();
    window.virtualManager = vm;
    const ok = await vm.initialize();
    expect(ok).toBe(true);

    const { mainRows, peerRows, hourlyRows } = sampleData();
    const rendered = vm.renderVirtualTable(mainRows, peerRows, hourlyRows);
    expect(rendered).toBe(true);

    const tbody = document.getElementById('tableBody');
    expect(tbody).toBeTruthy();
    expect(tbody.children.length).toBeGreaterThan(0);

    // Floating header should exist after setup
    expect(document.querySelector('.floating-table-header')).toBeTruthy();

    // Destroy and ensure floating header removed
    vm.destroy();
    expect(document.querySelector('.floating-table-header')).toBeFalsy();
  });
});
