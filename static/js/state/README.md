# State Management System

## Обзор

Система управления состоянием приложения состоит из нескольких модулей, каждый из которых отвечает за свою область:

- **`appState.js`** - Состояние приложения (фильтры, настройки дашборда, пользовательские предпочтения)
- **`tableState.js`** - Состояние таблицы (колонки, отображение, производительность, экспорт)
- **`urlState.js`** - Сохранение/загрузка состояния в URL
- **`eventBus.js`** - Система событий для уведомления об изменениях
- **`stateManager.js`** - Централизованное управление состоянием

## Структура состояния

### AppState (Состояние приложения)

```javascript
{
  isReversed: boolean,           // Режим реверса
  metricsData: object,           // Данные метрик
  status: string,                // Статус приложения ('idle', 'loading', 'success', 'error')
  
  filters: {                     // Фильтры дашборда
    customer: string,
    supplier: string,
    destination: string,
    from: string,
    to: string
  },
  
  dashboardView: {               // Настройки отображения дашборда
    currentMode: string,         // 'summary' | 'cdr'
    timeRange: string,           // '1h', '6h', '24h', '7d', '30d', 'custom'
    autoRefresh: boolean,
    refreshInterval: number
  },
  
  preferences: {                 // Пользовательские предпочтения
    theme: string,               // 'light' | 'dark' | 'auto'
    language: string,
    timezone: string,
    dateFormat: string,
    timeFormat: string
  },
  
  settings: {                    // Настройки приложения
    debugMode: boolean,
    performanceMonitoring: boolean,
    showTooltips: boolean,
    compactMode: boolean
  }
}
```

### TableState (Состояние таблицы)

```javascript
{
  globalFilterQuery: string,     // Глобальный фильтр
  columnFilters: object,         // Фильтры по колонкам
  multiSort: array,              // Множественная сортировка
  textFields: array,             // Текстовые поля
  yColumnsVisible: boolean,      // Видимость Y-колонок
  renderingMode: string,         // Режим рендеринга
  virtualScrollEnabled: boolean, // Включена ли виртуализация
  
  display: {                     // Настройки отображения
    compactMode: boolean,
    showRowNumbers: boolean,
    showGroupHeaders: boolean,
    showSummaryFooter: boolean,
    rowHeight: number,
    fontSize: number
  },
  
  columns: {                     // Управление колонками
    visible: array,              // Видимые колонки
    order: array,                // Порядок колонок
    widths: object,              // Ширина колонок
    frozen: array                // Закрепленные колонки
  },
  
  behavior: {                    // Поведение таблицы
    autoExpandGroups: boolean,
    rememberExpandedState: boolean,
    showLoadingIndicators: boolean,
    enableRowSelection: boolean,
    enableMultiSelection: boolean,
    enableDragAndDrop: boolean
  },
  
  performance: {                  // Настройки производительности
    enableVirtualization: boolean,
    enableLazyLoading: boolean,
    enableDebouncedSearch: boolean,
    searchDebounceMs: number,
    maxVisibleRows: number,
    renderBatchSize: number
  },
  
  export: {                      // Настройки экспорта
    defaultFormat: string,       // 'csv', 'excel', 'json'
    includeHeaders: boolean,
    includeFilters: boolean,
    includeSorting: boolean,
    filenameTemplate: string
  }
}
```

## Основные функции

### AppState

- `getFilters()` - Получить все фильтры
- `setFilters(filters)` - Установить фильтры
- `setFilter(key, value)` - Установить конкретный фильтр
- `resetFilters()` - Сбросить фильтры
- `setDashboardView(settings)` - Установить настройки дашборда
- `setPreferences(settings)` - Установить предпочтения
- `setSettings(settings)` - Установить настройки

### TableState

- `getDisplaySettings()` - Получить настройки отображения
- `setDisplaySettings(settings)` - Установить настройки отображения
- `getColumnSettings()` - Получить настройки колонок
- `setColumnSettings(settings)` - Установить настройки колонок
- `toggleColumnVisibility(columnKey)` - Переключить видимость колонки
- `setColumnWidth(columnKey, width)` - Установить ширину колонки
- `resetToDefaults()` - Сбросить к значениям по умолчанию

### StateManager

- `getCompleteState()` - Получить полное состояние
- `saveState()` - Сохранить состояние в URL
- `loadState()` - Загрузить состояние из URL
- `exportState()` - Экспортировать состояние в JSON
- `importState(jsonString)` - Импортировать состояние из JSON
- `resetAllState()` - Сбросить все состояние
- `setAutoSaveEnabled(enabled)` - Включить/выключить автосохранение

## События

### AppState события

- `appState:reverseModeChanged` - Изменен режим реверса
- `appState:statusChanged` - Изменен статус приложения
- `appState:filtersChanged` - Изменены фильтры
- `appState:dashboardViewChanged` - Изменен вид дашборда
- `appState:preferencesChanged` - Изменены предпочтения
- `appState:settingsChanged` - Изменены настройки

### TableState события

- `tableState:changed` - Изменено состояние таблицы
- `tableState:displayChanged` - Изменены настройки отображения
- `tableState:columnsChanged` - Изменены настройки колонок
- `tableState:behaviorChanged` - Изменено поведение таблицы
- `tableState:performanceChanged` - Изменены настройки производительности
- `tableState:exportChanged` - Изменены настройки экспорта

### StateManager события

- `stateManager:allStateReset` - Все состояние сброшено

## Примеры использования

### Подписка на изменения фильтров

```javascript
import { subscribe } from './state/eventBus.js';
import { getFilters } from './state/appState.js';

const unsubscribe = subscribe('appState:filtersChanged', (filters) => {
  console.log('Фильтры изменились:', filters);
  updateUI(filters);
});

// Позже отписаться
unsubscribe();
```

### Изменение настроек таблицы

```javascript
import { setDisplaySettings, setColumnWidth } from './state/tableState.js';

// Включить компактный режим
setDisplaySettings({ compactMode: true });

// Установить ширину колонки
setColumnWidth('destination', 250);
```

### Сохранение состояния

```javascript
import { stateManager } from './state/stateManager.js';

// Сохранить состояние в URL
stateManager.saveState();

// Экспортировать состояние
const stateJson = stateManager.exportState();
```

## Автосохранение

StateManager автоматически сохраняет состояние в URL при изменениях с задержкой в 1 секунду. Также доступно автосохранение каждые 30 секунд.

## Архитектура файлов

```
state/
├── appState.js          # Глобальное состояние приложения
├── tableState.js        # Состояние таблицы (16KB - самый большой)
├── stateManager.js      # Централизованный facade над состоянием
├── store.js             # Unified store с reducers
├── eventBus.js          # Pub/Sub система событий
├── expansionState.js    # Состояние раскрытия строк (main/peer)
├── runtimeFlags.js      # Runtime флаги (charts, rendering, fetch)
├── urlState.js          # Персистенция в URL (legacy hash)
├── shortLinkState.js    # Персистенция через short links API
├── moduleRegistry.js    # Реестр экземпляров модулей
├── actions.js           # Action creators для store
├── index.js             # Re-exports
└── reducers/
    ├── filtersReducer.js   # Reducer для фильтров
    └── tableReducer.js     # Reducer для таблицы
```

## Оптимизации

### Set для O(1) поиска
```javascript
// tableState.js
const VALID_RENDERING_MODES = new Set(['auto', 'virtual', 'standard']);
const VALID_EXPORT_FORMATS = new Set(['csv', 'excel', 'json']);

// Вместо Array.includes() используем Set.has()
if (VALID_RENDERING_MODES.has(mode)) { ... }
```

### Кэширование visibleColumnsSet
```javascript
// tableState.js
let _visibleColumnsSet = null;

export function isColumnVisible(columnKey) {
  // invalidate cache if visible array changed
  if (!_visibleColumnsSet || _visibleColumnsSet._source !== tableState.columns.visible) {
    _visibleColumnsSet = new Set(tableState.columns.visible);
    _visibleColumnsSet._source = tableState.columns.visible;
  }
  return _visibleColumnsSet.has(columnKey);
}
```

### Indexed loops в eventBus.publish
```javascript
// eventBus.js
export function publish(event, data) {
  const list = listeners[event];
  if (!list) return;
  // indexed loop for better performance
  const len = list.length;
  for (let i = 0; i < len; i++) {
    list[i](data);
  }
}
```

### Безопасное удаление из Set при итерации
```javascript
// expansionState.js
export function collapseMain(id) {
  // collect IDs to delete first, then delete
  const toDelete = [];
  for (const pid of peerExpanded) {
    if (pid.startsWith(prefix)) toDelete.push(pid);
  }
  for (let i = 0; i < toDelete.length; i++) {
    peerExpanded.delete(toDelete[i]);
  }
}
```

### for-in вместо Object.keys().forEach()
```javascript
// store.js, shortLinkState.js
for (const k in cf) {
  if (cf[k]) setColumnFilter(k, cf[k]);
}
```

## Зависимости между модулями

```
stateManager.js
├── appState.js
├── tableState.js
├── urlState.js
└── eventBus.js

store.js
├── stateManager.js
├── eventBus.js
├── appState.js
├── tableState.js
└── reducers/

urlState.js
├── shortLinkState.js
├── runtimeFlags.js
├── tableState.js
├── appState.js
└── dom/filter-helpers.js

expansionState.js
└── eventBus.js
```

## Совместимость

Новая система состояния обратно совместима со старым форматом URL. При загрузке старого состояния автоматически применяется миграция к новому формату.
