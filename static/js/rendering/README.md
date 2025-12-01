# Rendering Module

Модуль координации рендеринга таблиц VoIP Dashboard.

## Архитектура

```
rendering/
├── render-coordinator.js    # Сериализация рендеров, debounce, race prevention
├── table-controller.js      # Управление жизненным циклом таблицы
└── table-renderer.js        # Координация virtual vs standard рендеринга
```

## Основные модули

### `render-coordinator.js`
Singleton для сериализации рендеров:
- Debounce по типу рендера
- Cooldown между рендерами
- Очередь задач с приоритетами
- Race condition prevention

```js
import { renderCoordinator } from './render-coordinator.js';

// Запрос рендера с debounce
await renderCoordinator.requestRender('table', async () => {
  // render logic
}, { debounceMs: 200, cooldownMs: 0 });

// Настройка debounce
renderCoordinator.setDebounceMs(300);
```

### `table-controller.js`
Управление жизненным циклом таблицы:
- Инициализация TableRenderer
- Перерисовка таблицы
- Координация UI-компонентов

```js
import { TableController } from './table-controller.js';

const controller = new TableController();
await controller.initialize();

// Перерисовка
controller.redrawTable();

// Обновление UI
controller.updateTableUI();

// Статус
controller.getStatus();
// { isInitialized: true, hasRenderer: true, rendererStatus: {...} }
```

### `table-renderer.js`
Координация virtual vs standard рендеринга:
- Автоматический выбор режима
- Дедупликация строк
- Lazy-loading VirtualManager
- Fallback на standard при ошибках

```js
import { TableRenderer } from './table-renderer.js';

const renderer = new TableRenderer();
await renderer.initialize();

const result = await renderer.renderTable(mainRows, peerRows, hourlyRows);
// { success: true, mode: 'virtual' | 'standard' }

// Принудительный standard режим
await renderer.renderTable(mainRows, peerRows, hourlyRows, { forceStandard: true });
```

## Оптимизации

### uniqueByKeys — inline key building
```js
// Было:
function uniqueByKeys(arr, keys) {
  const seen = new Set();
  return arr.filter(r => {
    const k = keys.map(key => r?.[key] ?? '').join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Стало:
function uniqueByKeys(arr, keys) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const result = [];
  const len = arr.length;
  const keyCount = keys.length;

  for (let i = 0; i < len; i++) {
    const r = arr[i];
    // build key inline instead of map().join()
    let k = '';
    for (let j = 0; j < keyCount; j++) {
      if (j > 0) k += '|';
      k += r?.[keys[j]] ?? '';
    }
    if (!seen.has(k)) {
      seen.add(k);
      result.push(r);
    }
  }
  return result;
}
```

### isDomVirtualReady — indexed loop
```js
// Было:
function isDomVirtualReady() {
  return VIRTUAL_DOM_IDS.every(id => document.getElementById(id));
}

// Стало:
function isDomVirtualReady() {
  const len = VIRTUAL_DOM_IDS.length;
  for (let i = 0; i < len; i++) {
    if (!document.getElementById(VIRTUAL_DOM_IDS[i])) return false;
  }
  return true;
}
```

## RenderCoordinator API

### Методы

| Метод | Описание |
|-------|----------|
| `requestRender(kind, taskFn, options)` | Запрос рендера с debounce |
| `setDebounceMs(ms)` | Установка глобального debounce |

### Options

| Опция | Тип | Default | Описание |
|-------|-----|---------|----------|
| `debounceMs` | number | 500 | Debounce для этого запроса |
| `cooldownMs` | number | 0 (800 для table) | Минимальный интервал между рендерами |

### Внутреннее состояние

```js
class RenderCoordinator {
  _queue = [];                    // очередь задач
  _processing = false;            // флаг обработки
  _pendingByKind = new Map();     // pending задачи по типу
  _debounceMs = 500;              // глобальный debounce
  _cooldownMsByKind = { table: 800 };  // cooldown по типу
  _lastCompletedByKind = new Map();    // время последнего завершения
  _activeKinds = new Set();       // активные типы рендеров
}
```

## TableRenderer режимы

### Auto (default)
```js
// Автоматический выбор:
// - rowCount >= 50 → virtual
// - rowCount < 50 → standard
```

### Virtual
```js
// Принудительный virtual:
// - getRenderingMode() === 'virtual'
// - isVirtualScrollEnabled() === true
// - isDomVirtualReady() === true
```

### Standard
```js
// Принудительный standard:
// - getRenderingMode() === 'standard'
// - options.forceStandard === true
// - VirtualManager недоступен
```

## Порядок рендеринга

```
TableController.redrawTable()
└── _renderWithData()
    └── renderCoordinator.requestRender('table', async () => {
        ├── renderTableHeader()
        ├── renderTableFooter()
        ├── showTableControls()
        ├── initTableControls()
        ├── clearTableBody()
        ├── tableRenderer.renderTable() или renderGroupedTable()
        ├── initTableView()
        ├── initStickyHeader()
        ├── initStickyFooter()
        ├── updateTableFooter()
        └── initTooltips()
    })
```

## Зависимости

```
rendering/
├── dom/table.js             # renderGroupedTable
├── dom/table-ui.js          # renderTableHeader, renderTableFooter, etc.
├── dom/table-controls.js    # initTableControls
├── dom/tooltip.js           # initTooltips
├── dom/sticky-table-chrome.js  # initStickyHeader, initStickyFooter
├── data/tableProcessor.js   # getProcessedData
├── state/appState.js        # getMetricsData
├── state/tableState.js      # getRenderingMode, isVirtualScrollEnabled
├── state/moduleRegistry.js  # setVirtualManager
├── state/runtimeFlags.js    # setRenderingInProgress, getChartsCurrentInterval
├── virtual/virtual-manager.js  # VirtualManager (lazy)
└── utils/errorLogger.js     # logError
```

## Константы

```js
// render-coordinator.js
const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_COOLDOWNS = { table: 800 };

// table-controller.js
const RENDER_DEBOUNCE_MS = 200;

// table-renderer.js
const VIRTUALIZATION_THRESHOLD = 50;
const INFLIGHT_GUARD_MS = 200;
const VIRTUAL_DOM_IDS = [
  'virtual-scroll-container',
  'virtual-scroll-spacer',
  'summaryTable',
  'tableBody'
];
```

## Принципы

1. **Сериализация** — один рендер за раз через очередь
2. **Debounce** — объединение частых запросов
3. **Cooldown** — минимальный интервал между рендерами
4. **Fallback** — автоматический переход на standard при ошибках
5. **Lazy loading** — VirtualManager загружается по требованию
6. **Race prevention** — inflight guard для предотвращения гонок
