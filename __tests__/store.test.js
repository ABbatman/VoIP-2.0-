// __tests__/store.test.js
// Тесты для store: проверка dispatch последовательности действий и снапшоты итогового состояния

import { dispatch, getState, setDebugLogging } from '../static/js/state/store.js';
import {
  createSetFilter,
  createSetSort,
  createResetFilters,
  createResetTableFilters,
} from '../static/js/state/actions.js';

// Хелпер ожидания микротасок/тик ивент-лупа
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  // Отключаем подробное логирование, чтобы не засорять вывод тестов
  if (typeof window !== 'undefined') {
    window.DEBUG = false;
  }
  setDebugLogging(false);
});

beforeEach(() => {
  // Сбрасываем URL-хэш, чтобы не подтягивать состояние из адресной строки
  if (typeof window !== 'undefined') {
    window.location.hash = '';
  }
});

describe('store.dispatch sequence snapshots', () => {
  test('SET_FILTER -> SET_SORT -> RESET (filters + tableFilters)', async () => {
    // initial snapshot
    const initial = getState();
    expect(initial).toMatchSnapshot('initial-state');

    // 1) SET_FILTER (app.filters)
    dispatch(createSetFilter('customer', 'ACME'));
    await tick();
    const afterSetFilter = getState();
    expect(afterSetFilter).toMatchSnapshot('after-set-filter');

    // 2) SET_SORT (table.multiSort) - в текущей реализации редьюсер/commit может игнорировать этот экшен
    dispatch(createSetSort('destination', 'asc'));
    await tick();
    const afterSetSort = getState();
    expect(afterSetSort).toMatchSnapshot('after-set-sort');

    // 3) RESET: сбросим фильтры приложения и фильтры таблицы
    dispatch(createResetFilters());
    dispatch(createResetTableFilters());
    await tick();

    const finalState = getState();
    expect(finalState).toMatchSnapshot('final-after-resets');
  });
});
