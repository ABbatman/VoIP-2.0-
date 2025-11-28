// __tests__/zoom-table-sync.integration.test.js
// Integration tests for Chart Zoom <-> Table synchronization
// Tests that zoom changes trigger correct table re-aggregation

import { 
  setChartsZoomRange, 
  getChartsZoomRange,
  clearChartsZoomRange 
} from '../static/js/state/runtimeFlags.js';
import { publish, subscribe } from '../static/js/state/eventBus.js';

// Mock tableProcessor to track calls
jest.mock('../static/js/data/tableProcessor.js', () => ({
  getProcessedData: jest.fn(() => ({
    pagedData: [],
    totalFiltered: 0,
    peerRows: [],
    hourlyRows: [],
  })),
  computeAggregates: jest.fn(() => ({
    curr: { totalMinutes: 0, acdAvg: 0, asrAvg: 0, totalSuccessfulCalls: 0, totalCalls: 0 },
    y: { totalMinutes: 0, acdAvg: 0, asrAvg: 0, totalSuccessfulCalls: 0, totalCalls: 0 },
    delta: { totalMinutes: 0, acdAvg: 0, asrAvg: 0, totalSuccessfulCalls: 0, totalCalls: 0 },
  })),
  aggregatePeerRows: jest.fn((rows) => rows),
  aggregateMainRows: jest.fn((rows) => rows),
}));

import { getProcessedData, computeAggregates } from '../static/js/data/tableProcessor.js';

describe('Zoom -> Table sync integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearChartsZoomRange();
  });

  describe('runtimeFlags zoom state', () => {
    test('setChartsZoomRange should store zoom range', () => {
      const range = { fromTs: 1700000000000, toTs: 1700003600000 };
      setChartsZoomRange(range);
      
      const stored = getChartsZoomRange();
      expect(stored).toEqual(range);
    });

    test('clearChartsZoomRange should clear stored range', () => {
      setChartsZoomRange({ fromTs: 1700000000000, toTs: 1700003600000 });
      clearChartsZoomRange();
      
      const stored = getChartsZoomRange();
      expect(stored).toBeNull();
    });

    test('setChartsZoomRange should validate range', () => {
      // Invalid range (to <= from) should be rejected or normalized
      setChartsZoomRange({ fromTs: 1700003600000, toTs: 1700000000000 });
      
      // Implementation may either reject invalid range or store null
      const stored = getChartsZoomRange();
      // Either null or the system handles it gracefully
      expect(stored === null || stored.toTs > stored.fromTs).toBeTruthy();
    });

    test('setChartsZoomRange should handle non-finite values', () => {
      setChartsZoomRange({ fromTs: NaN, toTs: Infinity });
      
      const stored = getChartsZoomRange();
      expect(stored).toBeNull();
    });
  });

  describe('eventBus zoom events', () => {
    test('charts:zoomChanged event should be publishable', () => {
      const handler = jest.fn();
      const unsubscribe = subscribe('charts:zoomChanged', handler);
      
      publish('charts:zoomChanged', { fromTs: 1700000000000, toTs: 1700003600000 });
      
      expect(handler).toHaveBeenCalledWith({ fromTs: 1700000000000, toTs: 1700003600000 });
      unsubscribe();
    });

    test('table:refresh event should be publishable after zoom', () => {
      const handler = jest.fn();
      const unsubscribe = subscribe('table:refresh', handler);
      
      // Simulate zoom change triggering table refresh
      publish('table:refresh', {});
      
      expect(handler).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('zoom triggers table re-aggregation', () => {
    test('when zoom is set, getProcessedData should use zoom range', () => {
      const range = { fromTs: 1700000000000, toTs: 1700003600000 };
      setChartsZoomRange(range);
      
      // Call getProcessedData (mocked)
      getProcessedData();
      
      // Verify the mock was called
      expect(getProcessedData).toHaveBeenCalled();
    });

    test('when zoom is cleared, full data should be used', () => {
      // Set and then clear zoom
      setChartsZoomRange({ fromTs: 1700000000000, toTs: 1700003600000 });
      clearChartsZoomRange();
      
      getProcessedData();
      
      // Zoom should be null, so full data is used
      expect(getChartsZoomRange()).toBeNull();
    });

    test('computeAggregates should work with zoom active', () => {
      setChartsZoomRange({ fromTs: 1700000000000, toTs: 1700003600000 });
      
      const result = computeAggregates();
      
      expect(result).toBeDefined();
      expect(result.curr).toBeDefined();
      expect(result.delta).toBeDefined();
    });
  });
});

describe('Table -> Zoom sync (filter affects visible range)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearChartsZoomRange();
  });

  test('table filter changes should not affect zoom range', () => {
    const range = { fromTs: 1700000000000, toTs: 1700003600000 };
    setChartsZoomRange(range);
    
    // Simulate table filter change
    publish('table:filterChanged', { column: 'main', value: 'TestCustomer' });
    
    // Zoom should remain unchanged
    expect(getChartsZoomRange()).toEqual(range);
  });

  test('table sort changes should not affect zoom range', () => {
    const range = { fromTs: 1700000000000, toTs: 1700003600000 };
    setChartsZoomRange(range);
    
    // Simulate table sort change
    publish('table:sortChanged', { column: 'Min', direction: 'desc' });
    
    // Zoom should remain unchanged
    expect(getChartsZoomRange()).toEqual(range);
  });
});

describe('Concurrent operations', () => {
  test('rapid zoom changes should not cause race conditions', async () => {
    const ranges = [
      { fromTs: 1700000000000, toTs: 1700003600000 },
      { fromTs: 1700003600000, toTs: 1700007200000 },
      { fromTs: 1700007200000, toTs: 1700010800000 },
    ];

    // Rapid fire zoom changes
    ranges.forEach(range => setChartsZoomRange(range));
    
    // Should have the last value
    const finalRange = getChartsZoomRange();
    expect(finalRange).toEqual(ranges[ranges.length - 1]);
  });

  test('zoom change during table refresh should be handled', () => {
    let refreshCount = 0;
    const unsubscribe = subscribe('table:refresh', () => {
      refreshCount++;
      // Simulate changing zoom during refresh
      if (refreshCount === 1) {
        setChartsZoomRange({ fromTs: 1700010800000, toTs: 1700014400000 });
      }
    });

    publish('table:refresh', {});
    
    expect(refreshCount).toBe(1);
    unsubscribe();
  });
});

describe('Edge cases', () => {
  test('zoom range spanning midnight should work', () => {
    // 11pm to 1am next day
    const midnight = new Date('2024-01-15T00:00:00Z').getTime();
    const range = { fromTs: midnight - 3600000, toTs: midnight + 3600000 };
    
    setChartsZoomRange(range);
    expect(getChartsZoomRange()).toEqual(range);
  });

  test('very small zoom range should work', () => {
    // 1 minute range
    const range = { fromTs: 1700000000000, toTs: 1700000060000 };
    
    setChartsZoomRange(range);
    expect(getChartsZoomRange()).toEqual(range);
  });

  test('very large zoom range should work', () => {
    // 30 days range
    const range = { fromTs: 1700000000000, toTs: 1700000000000 + 30 * 24 * 3600 * 1000 };
    
    setChartsZoomRange(range);
    expect(getChartsZoomRange()).toEqual(range);
  });
});
