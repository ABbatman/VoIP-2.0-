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

## Совместимость

Новая система состояния обратно совместима со старым форматом URL. При загрузке старого состояния автоматически применяется миграция к новому формату.
