# Table Module

Модуль функций таблицы VoIP Dashboard.

## Архитектура

```
table/
└── features/
    ├── bulkToggle.js    # Bulk expand/collapse для standard и virtual
    └── sortControl.js   # Сортировка в standard и virtual режимах
```

## Основные модули

### `bulkToggle.js`
Массовое раскрытие/сворачивание строк:
- Standard mode — через expansionState + re-render
- Virtual mode — через VirtualManager API

```js
import { expandAllPeers, collapseAllPeers } from './features/bulkToggle.js';

// Автоматический выбор режима
expandAllPeers();   // раскрыть все
collapseAllPeers(); // свернуть все

// Явный режим
import { expandAllPeersStandard, collapseAllPeersStandard } from './features/bulkToggle.js';
import { expandAllPeersVirtual, collapseAllPeersVirtual } from './features/bulkToggle.js';

expandAllPeersStandard();  // только standard
expandAllPeersVirtual();   // только virtual
```

### `sortControl.js`
Управление сортировкой:
- Multi-sort до 3 ключей
- Toggle direction для primary key
- Promote to primary для secondary keys
- Сохранение scroll position

```js
import { applySortSafe } from './features/sortControl.js';

// Применить сортировку по ключу
await applySortSafe('destination');
// 1. Вычисляет новый multiSort
// 2. Сохраняет scrollTop
// 3. Рендерит таблицу
// 4. Восстанавливает scrollTop
```

## Оптимизации

### expandAllPeersStandard — indexed loop
```js
// Было:
const mainIds = Array.isArray(pagedData)
  ? pagedData.map(r => buildMainGroupId(r.main, r.destination))
  : [];

// Стало:
const mainIds = [];
if (Array.isArray(pagedData)) {
  const len = pagedData.length;
  for (let i = 0; i < len; i++) {
    const r = pagedData[i];
    mainIds.push(buildMainGroupId(r.main, r.destination));
  }
}
```

### computeNextMultiSort — без spread и filter
```js
// Было:
function computeNextMultiSort(current, key) {
  let ms = Array.isArray(current) ? [...current] : [];
  const found = ms.find(s => s.key === key);

  if (!found) {
    ms.unshift({ key, dir: 'asc' });
  } else if (ms[0]?.key === key) {
    found.dir = found.dir === 'asc' ? 'desc' : 'asc';
  } else {
    ms = [{ key, dir: 'asc' }, ...ms.filter(s => s.key !== key)];
  }

  return ms.slice(0, MAX_SORT_KEYS);
}

// Стало:
function computeNextMultiSort(current, key) {
  const ms = Array.isArray(current) ? current : [];
  const len = ms.length;

  // find index of key
  let foundIdx = -1;
  for (let i = 0; i < len; i++) {
    if (ms[i].key === key) {
      foundIdx = i;
      break;
    }
  }

  if (foundIdx === -1) {
    // new key — add at front
    const result = [{ key, dir: 'asc' }];
    const copyLen = Math.min(len, MAX_SORT_KEYS - 1);
    for (let i = 0; i < copyLen; i++) {
      result.push(ms[i]);
    }
    return result;
  }

  if (foundIdx === 0) {
    // toggle direction
    const result = [];
    for (let i = 0; i < len && i < MAX_SORT_KEYS; i++) {
      if (i === 0) {
        result.push({ key: ms[i].key, dir: ms[i].dir === 'asc' ? 'desc' : 'asc' });
      } else {
        result.push(ms[i]);
      }
    }
    return result;
  }

  // promote to primary
  const result = [{ key, dir: 'asc' }];
  for (let i = 0; i < len && result.length < MAX_SORT_KEYS; i++) {
    if (ms[i].key !== key) {
      result.push(ms[i]);
    }
  }
  return result;
}
```

## Multi-Sort логика

### Алгоритм
```
1. Клик по новому ключу:
   - Добавить в начало с dir='asc'
   - Ограничить до MAX_SORT_KEYS (3)

2. Клик по primary ключу (index 0):
   - Toggle direction: asc ↔ desc

3. Клик по secondary ключу (index > 0):
   - Promote to primary с dir='asc'
   - Остальные сдвигаются
```

### Пример
```js
// Начальное состояние: []

// Клик 'destination':
[{ key: 'destination', dir: 'asc' }]

// Клик 'main':
[{ key: 'main', dir: 'asc' }, { key: 'destination', dir: 'asc' }]

// Клик 'main' (toggle):
[{ key: 'main', dir: 'desc' }, { key: 'destination', dir: 'asc' }]

// Клик 'destination' (promote):
[{ key: 'destination', dir: 'asc' }, { key: 'main', dir: 'desc' }]
```

## Bulk Toggle логика

### Standard mode
```
expandAllPeersStandard():
1. Получить pagedData
2. Построить mainIds из всех строк
3. expandAllMain(mainIds) — обновить expansionState
4. renderStandardTable() — перерисовать
5. updateButton('Hide All', 'shown')

collapseAllPeersStandard():
1. collapseAll() — сбросить expansionState
2. renderStandardTable() — перерисовать
3. updateButton('Show All', 'hidden')
```

### Virtual mode
```
expandAllPeersVirtual():
1. vm.showAllRows()

collapseAllPeersVirtual():
1. vm.hideAllRows()
```

## Зависимости

```
table/features/
├── dom/selectors.js         # getTableBody, getExpandAllButton, isVirtualModeActive
├── dom/table.js             # renderGroupedTable
├── data/tableProcessor.js   # getProcessedData
├── state/appState.js        # getMetricsData
├── state/tableState.js      # getState, setMultiSort
├── state/expansionState.js  # expandAllMain, collapseAll, buildMainGroupId
├── state/moduleRegistry.js  # getVirtualManager
├── rendering/render-coordinator.js  # renderCoordinator
└── utils/errorLogger.js     # logError
```

## Константы

```js
// bulkToggle.js
const RENDER_OPTIONS = { debounceMs: 0, cooldownMs: 0 };

// sortControl.js
const MAX_SORT_KEYS = 3;
const SORT_DEBOUNCE_MS = 120;
const SCROLL_CONTAINER_ID = 'virtual-scroll-container';
const SCROLL_CONTAINER_SELECTOR = '.results-display__table-wrapper';
```

## Принципы

1. **Facade pattern** — `expandAllPeers()` выбирает режим автоматически
2. **Indexed loops** — вместо map/filter/find
3. **Без spread** — явное копирование элементов
4. **Guard-clauses** — ранние выходы
5. **Scroll preservation** — сохранение позиции при сортировке
6. **Debounce** — через renderCoordinator
