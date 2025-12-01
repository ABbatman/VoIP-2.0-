# DOM Module

Модуль управления DOM-элементами дашборда метрик VoIP.

## Архитектура

```
dom/
├── components/          # Переиспользуемые UI-компоненты
│   ├── button.js        # Кнопки
│   ├── filter-cell.js   # Ячейки фильтров
│   ├── header-cell.js   # Ячейки заголовков таблицы
│   ├── sort-arrow.js    # Стрелки сортировки
│   └── typeahead.js     # Автодополнение
├── filters.js           # Фильтры и fetch-оркестрация
├── filter-helpers.js    # Хелперы для работы с фильтрами
├── table-ui.js          # UI таблицы (заголовки, сортировка, агрегаты)
├── table-renderers.js   # Рендеринг строк таблицы (string/DOM)
├── table-controls.js    # Контролы таблицы (expand/collapse)
├── table.js             # Стандартный рендеринг таблицы
├── sticky-table-chrome.js # Sticky header/footer
├── renderer.js          # Рендеринг HTML-фреймворка дашборда
├── summary.js           # Виджет summary-метрик
├── tooltip.js           # PDD/ATime тултип на ASR-ячейках
├── ellipsis-tooltip.js  # Тултип для обрезанного текста
├── hideYColumns.js      # Переключение видимости Y-колонок
├── top-scrollbar.js     # Синхронизация верхнего скроллбара
├── scroll-controls.js   # Кнопка scroll-to-top
├── layout.js            # Синхронизация layout с состоянием
├── ui-feedback.js       # Визуальная обратная связь (toasts, loading)
├── ui-widgets.js        # Flatpickr и time-контролы
└── selectors.js         # Централизованные DOM-селекторы
```

## Основные модули

### `filters.js`
Главный модуль фильтрации. Управляет:
- Инициализацией фильтров (`initFilters`)
- Обработкой кликов Find/Summary/Reverse
- Подписками на события (interval, filters, data, UI)
- Кэшированием метрик

```js
import { initFilters, clearTableFilters } from './filters.js';

initFilters(isStateLoaded);
clearTableFilters();
```

### `table-ui.js`
UI-слой таблицы:
- Рендеринг заголовков и футера
- Сортировка (делегированные обработчики)
- Фильтры колонок
- Агрегаты

```js
import { renderTableHeader, renderTableFooter, updateSortArrows } from './table-ui.js';

renderTableHeader();
renderTableFooter();
updateSortArrows();
```

### `table-renderers.js`
Рендеринг строк таблицы:
- `renderMainRowString` — главные строки
- `renderPeerRowString` — peer-строки
- `renderHourlyRowsString` — hourly-строки

```js
import { renderMainRowString, renderPeerRowString } from './table-renderers.js';

const html = renderMainRowString(mainRow, { mainGroupId, isMainGroupOpen });
```

### `sticky-table-chrome.js`
Sticky-клоны для header и footer:
- RAF-throttled синхронизация
- Автоматическое позиционирование
- Синхронизация ширины ячеек

```js
import { initStickyHeader, initStickyFooter } from './sticky-table-chrome.js';

initStickyHeader();
initStickyFooter();
```

## Оптимизации

### Кэширование DOM-элементов
```js
// filters.js, filter-helpers.js, top-scrollbar.js
const _elemCache = new Map();

function getElement(id) {
  let el = _elemCache.get(id);
  if (el === undefined) {
    el = document.getElementById(id);
    _elemCache.set(id, el);
  }
  // invalidate if removed from DOM
  if (el && !document.body.contains(el)) {
    el = document.getElementById(id);
    _elemCache.set(id, el);
  }
  return el;
}
```

### Set для O(1) поиска
```js
// table-ui.js
const Y_COLUMN_INDICES = new Set([1, 4, 7, 10, 13]);
const DELTA_POSITIONS = new Set([3, 6, 9, 12, 15]);

// Вместо Array.includes() используем Set.has()
if (Y_COLUMN_INDICES.has(idx)) { ... }
```

### Map для индексации
```js
// table-ui.js - updateSortArrows
const sortIndexMap = new Map(multiSort.map((s, i) => [s.key, i]));
const idx = sortIndexMap.get(key); // O(1) вместо indexOf O(n)
```

### Кэширование norm()
```js
// table.js
const normCache = new Map();
const NORM_CACHE_MAX = 10000;

function norm(v) {
  if (v == null) return '';
  const s = String(v).trim();
  let result = normCache.get(s);
  if (result === undefined) {
    result = s.toLowerCase();
    if (normCache.size < NORM_CACHE_MAX) {
      normCache.set(s, result);
    }
  }
  return result;
}
```

### Оптимизированный escapeHtml
```js
// table-renderers.js
const ESCAPE_REGEX = /[&<>"']/g;
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
  const s = String(str);
  if (!ESCAPE_REGEX.test(s)) return s; // fast path
  ESCAPE_REGEX.lastIndex = 0;
  return s.replace(ESCAPE_REGEX, ch => ESCAPE_MAP[ch]);
}
```

### Indexed loops вместо forEach
```js
// Вместо:
nodeList.forEach(el => { ... });

// Используем:
const len = nodeList.length;
for (let i = 0; i < len; i++) {
  nodeList[i]...
}
```

### DocumentFragment для batch DOM
```js
// typeahead.js
const fragment = document.createDocumentFragment();
for (let i = 0; i < len; i++) {
  fragment.appendChild(createItemElement(...));
}
container.appendChild(fragment);
```

## События

Модуль использует eventBus для коммуникации:

| Событие | Источник | Описание |
|---------|----------|----------|
| `appState:statusChanged` | appState | Изменение статуса (loading/success/error) |
| `appState:dataChanged` | appState | Новые данные загружены |
| `appState:filtersChanged` | appState | Фильтры изменены |
| `appState:reverseModeChanged` | appState | Переключение reverse mode |
| `tableState:changed` | tableState | Изменение состояния таблицы |
| `tableState:yVisibilityChanged` | tableState | Видимость Y-колонок |
| `charts:intervalChanged` | charts | Изменение интервала графика |

## Зависимости

```
dom/
├── state/          # appState, tableState, eventBus, runtimeFlags
├── data/           # fetchMetrics, metricsCache, tableProcessor
├── rendering/      # render-coordinator, table-renderer
├── table/          # features/sortControl, features/bulkToggle
├── utils/          # errorLogger, helpers
└── visualEnhancements/  # microCharts, heatmapStyling, hierarchyGuides
```

## Тестирование

```bash
npm test -- --testPathPattern="dom"
```

## Принципы

1. **Кэширование** — DOM-элементы, вычисления, regex
2. **O(1) поиск** — Set/Map вместо Array.includes/indexOf
3. **Indexed loops** — для NodeList и массивов
4. **Guard-clauses** — ранние выходы
5. **Делегирование событий** — один listener на контейнер
6. **RAF-throttling** — для scroll/resize handlers
