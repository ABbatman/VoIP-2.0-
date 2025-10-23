// __tests__/metrics.test.js
import { parseNum, computeDeltaPercent, pickDeltaDisplay, formatMetricValue } from '../static/js/utils/metrics.js';

describe('metrics utils', () => {
  test('parseNum handles numbers, strings with spaces/commas and invalids', () => {
    expect(parseNum(12.5)).toBe(12.5);
    expect(parseNum(' 1,234.50 ')).toBeCloseTo(1234.5);
    expect(Number.isNaN(parseNum('abc'))).toBe(true);
    expect(Number.isNaN(parseNum(null))).toBe(true);
  });

  test('computeDeltaPercent returns percent change and handles zero-yesterday', () => {
    expect(computeDeltaPercent(110, 100)).toBeCloseTo(10);
    expect(computeDeltaPercent(90, 100)).toBeCloseTo(-10);
    expect(computeDeltaPercent(5, 0)).toBe(100);
    expect(computeDeltaPercent(0, 0)).toBe(0);
    expect(computeDeltaPercent('x', 10)).toBeNull();
  });

  test('pickDeltaDisplay produces display and class', () => {
    let res = pickDeltaDisplay(110, 100);
    expect(res.display).toBe('10');
    expect(res.className).toBe('cell-positive');

    res = pickDeltaDisplay(90, 100);
    expect(res.display).toBe('10');
    expect(res.className).toBe('cell-negative');

    res = pickDeltaDisplay(0, 0);
    expect(res.display).toBe('');
    expect(res.className).toBe('');

    res = pickDeltaDisplay(5, 0);
    expect(res.display).toBe('100');
    expect(res.className).toBe('cell-positive');
  });

  test('formatMetricValue rounds Min and passes through numbers', () => {
    expect(formatMetricValue('Min', 12.7)).toBe(13);
    expect(formatMetricValue('ACD', 1.23)).toBe(1.23);
    expect(formatMetricValue('ASR', 'n/a')).toBe('n/a');
  });
});
