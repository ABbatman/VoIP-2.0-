# Contributing Guide — Frontend Architecture

## Обзор архитектуры

Фронтенд использует **кастомную модульную архитектуру** без фреймворков (Vanilla JS + Vite).  
Ключевые принципы: **однонаправленный поток данных**, **централизованное состояние**, **event-driven обновления**.

```
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ /api/metrics
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  appState.js │◄───│tableProcessor│◄───│WorkerClient  │      │
│  │  (raw data)  │    │ (filtering)  │    │(aggregation) │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ getProcessedData()
┌─────────────────────────────────────────────────────────────────┐
│                      STATE LAYER                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ tableState.js│    │ eventBus.js  │    │runtimeFlags  │      │
│  │  (UI state)  │    │  (pub/sub)   │    │  (temp flags)│      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ subscribe('tableState:changed')
┌─────────────────────────────────────────────────────────────────┐
│                    RENDERING LAYER                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │table-controller│  │table-renderer│    │render-coord  │      │
│  │ (lifecycle)  │    │(virtual/std) │    │ (debounce)   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ renderGroupedTable()
┌─────────────────────────────────────────────────────────────────┐
│                       DOM LAYER                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   table.js   │    │ table-ui.js  │    │sticky-chrome │      │
│  │  (render)    │    │(header/footer)│   │(float h/f)   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Структура директорий

```
static/js/
├── main.js                    # Entry point, CSS imports
├── core/
│   └── appInitializer.js      # Bootstrap, module orchestration
├── state/
│   ├── appState.js            # Raw data storage (metrics from API)
│   ├── tableState.js          # UI state (filters, sort, expansion)
│   ├── eventBus.js            # Pub/sub for state changes
│   ├── runtimeFlags.js        # Temporary flags (focus, pending ops)
│   └── moduleRegistry.js      # Dynamic module references
├── data/
│   └── tableProcessor.js      # Filtering, sorting, aggregation
├── rendering/
│   ├── table-controller.js    # Render lifecycle management
│   ├── table-renderer.js      # Virtual/standard mode switching
│   └── render-coordinator.js  # Debounced render queue
├── dom/
│   ├── table.js               # renderGroupedTable, row expansion
│   ├── table-ui.js            # Header, footer, sort arrows
│   ├── table-renderers.js     # Row HTML generation
│   ├── sticky-table-chrome.js # Floating header/footer
│   └── filters.js             # Filter panel handlers
├── workers/
│   ├── aggregation.worker.js  # Off-thread aggregation
│   └── aggregationWorkerClient.js
└── utils/
    └── errorLogger.js         # Centralized error handling
```

---

## State Management

### 1. appState.js — Raw Data Store

Хранит **неизменяемые данные** полученные с API.

```js
// Запись данных
import { setMetricsData } from './state/appState.js';
setMetricsData(apiResponse);

// Чтение данных
import { getMetricsData, getFullData } from './state/appState.js';
const raw = getMetricsData();           // { main_rows, peer_rows, hourly_rows }
const { mainRows, peerRows, hourlyRows } = getFullData();  // normalized
```

**Правило:** Никогда не мутировать данные напрямую. Только через `setMetricsData()`.

---

### 2. tableState.js — UI State Store

Хранит **состояние UI**: фильтры, сортировка, развёрнутые группы.

```js
import { 
  getState,           // Получить всё состояние
  setColumnFilter,    // Установить фильтр колонки
  setMultiSort,       // Установить сортировку
  toggleMainExpanded, // Развернуть/свернуть main row
  togglePeerExpanded, // Развернуть/свернуть peer row
  areYColumnsVisible  // Видимость Y-колонок (24h ago)
} from './state/tableState.js';

// Структура состояния
const state = {
  columnFilters: { main: '', peer: '', destination: '', ACD: '>0', ... },
  multiSort: [{ key: 'Min', dir: 'desc' }],
  globalFilterQuery: '',
  expandedMainGroups: Set(['Customer A||Ethiopia']),
  expandedPeerGroups: Set(['Customer A||Supplier X||Ethiopia']),
  yColumnsVisible: true,
  textFields: ['main', 'peer', 'destination']
};
```

---

### 3. eventBus.js — Pub/Sub System

Связывает state changes с UI updates.

```js
import { subscribe, publish } from './state/eventBus.js';

// Подписка на события
subscribe('tableState:changed', (payload) => {
  // Перерисовать таблицу
});

subscribe('tableState:yVisibilityChanged', () => {
  // Обновить видимость Y-колонок
});

subscribe('appState:reverseModeChanged', () => {
  // Поменять Customer/Supplier местами
});

// Публикация события (обычно из state модулей)
publish('tableState:changed', { source: 'filter' });
```

**Доступные события:**
| Event | Trigger | Payload |
|-------|---------|---------|
| `tableState:changed` | Любое изменение tableState | `{ source }` |
| `tableState:yVisibilityChanged` | Toggle Y-columns | — |
| `appState:reverseModeChanged` | Reverse mode toggle | — |
| `appState:dataLoaded` | New data from API | — |

---

## Data Flow — Filtering Pipeline

```
Raw Data (appState)
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    tableProcessor.js                         │
│                                                              │
│  1. getFullData()         → mainRows, peerRows, hourlyRows   │
│  2. getValidZoomRange()   → chart zoom filter                │
│  3. aggregatePeerRows()   → re-aggregate if zoomed           │
│  4. aggregateMainRows()   → re-aggregate if zoomed           │
│  5. applyColumnFilters()  → filter main rows                 │
│  6. filterPeerRows()      → filter peer rows                 │
│  7. filterHourlyRows()    → filter hourly rows               │
│  8. applyGlobalFilter()   → text search                      │
│  9. sortRows()            → multi-column sort                │
│                                                              │
│  Output: { pagedData, peerRows, hourlyRows, totalFiltered }  │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
Filtered Data → renderGroupedTable()
```

### Фильтрация по уровням

```
Main Rows    → фильтруются по всем колонкам (peer через связь)
    │
    ▼
Peer Rows    → принадлежат отфильтрованным main + свои фильтры
    │
    ▼
Hourly Rows  → принадлежат отфильтрованным peer + свои фильтры
```

---

## Column Filter Syntax

| Syntax | Meaning | Example |
|--------|---------|---------|
| `value` | >= value | `10` → ACD >= 10 |
| `>value` | > value | `>0` → ACD > 0 |
| `<value` | < value | `<50` → ASR < 50 |
| `>=value` | >= value | `>=100` → Min >= 100 |
| `<=value` | <= value | `<=5` → ACD <= 5 |
| `=value` | == value | `=0` → exactly 0 |
| `!=value` | != value | `!=0` → not 0 |
| `text` | contains | `eth` → destination contains "eth" |

---

## Rendering Pipeline

### 1. table-controller.js — Lifecycle

```js
class TableController {
  async redrawTable() {
    const { pagedData, peerRows, hourlyRows } = getProcessedData();
    this._renderWithData(pagedData, appData, peerRows, hourlyRows);
  }

  _renderWithData(mainRows, appData, peerRows, hourlyRows) {
    renderCoordinator.requestRender('table', async () => {
      renderTableHeader();
      renderTableFooter();
      
      if (this.tableRenderer) {
        await this.tableRenderer.renderTable(mainRows, peerRows, hourlyRows);
      } else {
        renderGroupedTable(mainRows, peerRows, hourlyRows);
      }
      
      initStickyHeader();
      initStickyFooter();
    });
  }
}
```

### 2. render-coordinator.js — Debouncing

Предотвращает множественные перерисовки.

```js
renderCoordinator.requestRender('table', callback, { 
  debounceMs: 16,   // RAF timing
  cooldownMs: 100   // Min interval between renders
});
```

### 3. table.js — DOM Rendering

```js
export function renderGroupedTable(mainRows, peerRows, hourlyRows) {
  // 1. Dedupe rows
  const mRows = uniqueBy(mainRows, ...);
  const pRows = uniqueBy(peerRows, ...);
  const hRows = uniqueBy(hourlyRows, ...);

  // 2. Render header/footer
  renderTableHeader();
  renderTableFooter();

  // 3. Build HTML
  mRows.forEach(mainRow => {
    html += renderMainRowString(mainRow, opts);
    
    const peers = pRows.filter(p => matches(p, mainRow));
    peers.forEach(peerRow => {
      html += renderPeerRowString(peerRow, opts);
      
      const hours = hRows.filter(h => matches(h, peerRow));
      html += renderHourlyRowsString(hours, opts);
    });
  });

  // 4. Apply to DOM (morphdom for efficient updates)
  applyMorphdom(tbody, html);
}
```

---

## Aggregation (Y-columns & Deltas)

### Структура данных

```js
// Каждая строка содержит:
{
  // Current period
  Min: 120,      SCall: 450,    TCall: 500,
  ACD: 2.54,     ASR: 32,
  
  // Y period (24h ago)
  YMin: 100,     YSCall: 430,   YTCall: 480,
  YACD: 2.75,    YASR: 35,
  
  // Deltas (% change)
  Min_delta: 20,    // (120-100)/100 * 100
  ACD_delta: -7.6,  // (2.54-2.75)/2.75 * 100
  ASR_delta: -8.6,
  SCall_delta: 4.7,
  TCall_delta: 4.2
}
```

### Агрегация при zoom

Когда пользователь зумит график, данные переагрегируются:

```js
// tableProcessor.js
if (zoomRange) {
  effectiveHourlyRows = filterByZoomRange(hourlyRows, zoomRange);
  effectivePeerRows = aggregatePeerRows(effectiveHourlyRows);
  effectiveMainRows = aggregateMainRows(effectivePeerRows);
}
```

### Web Worker для тяжёлых операций

```js
// aggregationWorkerClient.js
const result = await fullReaggregationAsync(hourlyRows, fromTs, toTs);
// Returns: { hourlyRows, peerRows, mainRows }
```

---

## Sticky Header/Footer

### Принцип работы

```js
// sticky-table-chrome.js
function createFloatingHeader(table, thead) {
  const wrap = document.createElement('div');
  wrap.className = 'floating-table-header';
  
  const tmpTable = document.createElement('table');
  tmpTable.className = table.className;
  tmpTable.appendChild(thead.cloneNode(true));  // Clone header
  
  wrap.appendChild(tmpTable);
  document.body.appendChild(wrap);
  return wrap;
}

function syncFloatingHeader() {
  // Position: fixed at top when original header scrolls out
  // Width: match container width
  // Cell widths: sync with original header cells
  syncCellWidths(originalThs, floatingThs);
}
```

---

## Best Practices

### 1. Изменение состояния

```js
// ✅ Правильно — через state функции
setColumnFilter('ACD', '>0');
setMultiSort([{ key: 'Min', dir: 'desc' }]);

// ❌ Неправильно — прямая мутация
state.columnFilters.ACD = '>0';
```

### 2. Получение данных

```js
// ✅ Правильно — через getProcessedData()
const { pagedData, peerRows, hourlyRows } = getProcessedData();

// ❌ Неправильно — напрямую из appState
const data = getMetricsData();
renderTable(data.main_rows, data.peer_rows);  // Нефильтрованные!
```

### 3. Подписка на события

```js
// ✅ Правильно — подписка в init
export function init() {
  subscribe('tableState:changed', handleStateChange);
}

// ❌ Неправильно — подписка при каждом вызове
function render() {
  subscribe('tableState:changed', ...);  // Memory leak!
}
```

### 4. Рендеринг

```js
// ✅ Правильно — через coordinator
renderCoordinator.requestRender('table', () => {
  renderGroupedTable(mainRows, peerRows, hourlyRows);
});

// ❌ Неправильно — прямой вызов (может быть race condition)
renderGroupedTable(mainRows, peerRows, hourlyRows);
```

---

## Добавление новой колонки

1. **Backend:** Добавить в `constants.py` (MAIN_HEADERS, PEER_HEADERS, HOURLY_HEADERS)

2. **tableProcessor.js:** Если нужна агрегация — добавить в `AGG_METRICS` и функции агрегации

3. **table-ui.js:** Добавить в `COLUMN_CONFIG`:
```js
{ label: () => 'NewCol', key: 'NewCol', filterable: true }
```

4. **table-renderers.js:** Добавить рендеринг ячейки

5. **CSS:** Добавить стили если нужны особые (ширина, цвет)

---

## Добавление нового фильтра

1. **tableProcessor.js:** Расширить `passesColumnFilter()` если нужен новый синтаксис

2. **table-ui.js:** Добавить placeholder в `getFilterPlaceholder()`

3. **Тесты:** Добавить в `__tests__/tableProcessor.test.js`

---

## Debugging

### Console helpers

```js
// Текущее состояние
window.App.getState();

// Данные
window.App.getMetricsData();
window.App.getProcessedData();

// Принудительная перерисовка
window.App.tableController.redrawTable();
```

### Error logging

```js
import { logError, ErrorCategory } from './utils/errorLogger.js';

try {
  // ...
} catch (e) {
  logError(ErrorCategory.TABLE, 'functionName', e);
}
```

---

## Testing

```bash
# Unit tests
npm test

# Specific test
npm test -- tableProcessor

# Watch mode
npm test -- --watch
```

---

## Code Style

- **Комментарии:** Короткие, на английском: `// init dashboard`, `// filter rows`
- **Naming:** camelCase для функций/переменных, PascalCase для классов
- **Imports:** Группировать по типу (state, data, dom, utils)
- **No frameworks:** Vanilla JS only, минимум зависимостей
