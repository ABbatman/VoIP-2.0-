# DOM Patcher Module

## Обзор

Модуль `domPatcher.js` использует **morphdom** для эффективного обновления DOM при изменении состояния приложения. Он автоматически интегрируется с системой состояния и **защищает виртуализированную таблицу** от изменений.

## Основные возможности

### 🚀 **Автоматическая интеграция**
- Автоматически слушает изменения состояния (`appState`, `tableState`)
- Вызывает `render(state)` при изменении состояния
- Передает результат в `morphdom` для обновления DOM

### 🛡️ **Защита виртуализации**
- **НЕ изменяет** содержимое `<div id="virtual-scroll-container">`
- **НЕ изменяет** элементы `summaryTable`, `tableHead`, `tableBody`
- Сохраняет состояние виртуализации при обновлениях

### ⚡ **Производительность**
- Debounced обновления (по умолчанию 100ms)
- Очередь патчей для множественных изменений
- Оптимизированные алгоритмы morphdom

## Архитектура

```
State Change Event
        ↓
   DOM Patcher
        ↓
   Render New HTML
        ↓
   morphdom Patch
        ↓
   Updated DOM (без виртуализации)
```

## API

### Основные методы

#### `domPatcher.initialize()`
Инициализирует DOM Patcher и подписывается на события состояния.

```javascript
import { domPatcher } from './utils/domPatcher.js';

domPatcher.initialize();
```

#### `domPatcher.setContainer(container)`
Устанавливает контейнер для патчинга.

```javascript
const container = document.getElementById('dashboard-container');
domPatcher.setContainer(container);
```

#### `domPatcher.forcePatch(state)`
Принудительно выполняет патч DOM.

```javascript
const newState = {
  app: { filters: { customer: 'New Corp' } }
};

domPatcher.forcePatch(newState);
```

### Функции-помощники

#### `patchDOM(state)`
Удобная функция для патчинга.

```javascript
import { patchDOM } from './utils/domPatcher.js';

patchDOM({ app: { filters: { customer: 'Patched Corp' } } });
```

#### `setPatcherContainer(container)`
Устанавливает контейнер для патчера.

```javascript
import { setPatcherContainer } from './utils/domPatcher.js';

setPatcherContainer(document.getElementById('dashboard-container'));
```

#### `getPatcherStatus()`
Получает статус патчера.

```javascript
import { getPatcherStatus } from './utils/domPatcher.js';

const status = getPatcherStatus();
console.log('Status:', status);
```

## Конфигурация morphdom

### Защищенные элементы

```javascript
onBeforeElUpdated: (fromEl, toEl) => {
  // Никогда не обновлять виртуализированную таблицу
  if (fromEl.id === 'virtual-scroll-container' || 
      fromEl.id === 'summaryTable' ||
      fromEl.id === 'tableHead' ||
      fromEl.id === 'tableBody') {
    return false; // Пропустить обновление
  }
  
  // Никогда не обновлять элементы внутри виртуализированного контейнера
  if (fromEl.closest('#virtual-scroll-container')) {
    return false; // Пропустить обновление
  }
  
  return true; // Разрешить обновление
}
```

### Оптимизации

```javascript
// Использовать ID как ключ для стабильных обновлений
getNodeKey: (node) => {
  if (node.nodeType === Node.ELEMENT_NODE && node.id) {
    return node.id;
  }
  return null;
}

// Очистка event listeners перед удалением
onBeforeNodeDiscarded: (node) => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    this._cleanupEventListeners(node);
  }
  return true;
}
```

## Интеграция с состоянием

### Автоматические подписки

```javascript
// App state changes
subscribe('appState:filtersChanged', (filters) => {
  this._queuePatch({ app: { filters } });
});

subscribe('appState:dashboardViewChanged', (dashboardView) => {
  this._queuePatch({ app: { dashboardView } });
});

// Table state changes
subscribe('tableState:displayChanged', (display) => {
  this._queuePatch({ table: { display } });
});
```

### Очередь патчей

```javascript
_queuePatch(state) {
  if (this.isPatching) {
    this.patchQueue.push(state);
    return;
  }

  // Debounce multiple rapid state changes
  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer);
  }

  this.debounceTimer = setTimeout(() => {
    this._executePatch(state);
  }, this.debounceDelay);
}
```

## Интеграция с MetricsDashboardModule

```javascript
import { domPatcher, setPatcherContainer } from '../utils/domPatcher.js';

export class MetricsDashboardModule {
  async init(containerId) {
    // ... existing code ...
    
    // Initialize DOM patcher
    domPatcher.initialize();
    
    // Render framework
    const result = dashboardRenderer.render(currentState, container);
    
    // Set container for DOM patcher
    setPatcherContainer(result);
  }
  
  updateFramework(state = {}) {
    try {
      // Use DOM patcher for efficient updates
      domPatcher.forcePatch(state);
    } catch (error) {
      // Fallback to manual update if patcher fails
      dashboardRenderer.updateFramework(state);
    }
  }
}
```

## Отладка

### Статус патчера

```javascript
const status = domPatcher.getStatus();
console.log('Patcher Status:', {
  isInitialized: status.isInitialized,
  isPatching: status.isPatching,
  queueLength: status.patchQueue.length,
  currentContainer: status.currentContainer,
  patchOptions: status.patchOptions
});
```

### Логирование

```javascript
// В консоли вы увидите:
// ✅ DOM Patcher: Initialized with morphdom
// 🔄 DOM Patcher: Starting patch operation
// 🛡️ DOM Patcher: Skipping virtualized table elements
// ✅ DOM Patcher: DOM patched successfully
```

### Тестирование защиты виртуализации

```javascript
// Попробуйте обновить состояние таблицы
patchDOM({
  table: {
    display: { compactMode: true }
  }
});

// В консоли должно появиться:
// 🛡️ DOM Patcher: Skipping elements inside virtualized container
```

## Производительность

### Debouncing

```javascript
// По умолчанию: 100ms
domPatcher.setDebounceDelay(200); // Увеличить до 200ms

// Множественные изменения состояния за 100ms
// будут объединены в один патч
```

### Очередь патчей

```javascript
// Если патч уже выполняется, новые изменения
// добавляются в очередь и выполняются последовательно
```

### Оптимизации morphdom

- Использование ID как ключей для стабильных обновлений
- Пропуск текстовых узлов
- Очистка event listeners перед удалением элементов

## Обработка ошибок

### Fallback механизм

```javascript
try {
  // Use DOM patcher for efficient updates
  domPatcher.forcePatch(state);
} catch (error) {
  // Fallback to manual update if patcher fails
  dashboardRenderer.updateFramework(state);
}
```

### Валидация

```javascript
// Проверка контейнера
if (!this.currentContainer || this.isPatching) {
  return;
}

// Проверка элементов для патчинга
if (newContent && currentContent) {
  // Выполнить патч
} else {
  console.warn('Could not find content elements for patching');
}
```

## Примеры использования

### Базовое использование

```javascript
import { domPatcher } from './utils/domPatcher.js';

// Инициализация
domPatcher.initialize();

// Установка контейнера
domPatcher.setContainer(document.getElementById('dashboard-container'));

// Патч DOM
domPatcher.forcePatch({
  app: { filters: { customer: 'Example Corp' } }
});
```

### Интеграция с состоянием

```javascript
// DOM Patcher автоматически слушает изменения состояния
// и выполняет патчи без дополнительного кода

// Просто измените состояние:
setFilters({ customer: 'New Corp' });

// DOM Patcher автоматически обновит DOM
```

### Тестирование защиты

```javascript
// Попробуйте обновить виртуализированную таблицу
patchDOM({
  table: { display: { compactMode: true } }
});

// Таблица НЕ изменится благодаря защите
```

## Важные принципы

### ✅ Что делает DOM Patcher:
- Автоматически слушает изменения состояния
- Эффективно обновляет DOM через morphdom
- Защищает виртуализированную таблицу
- Оптимизирует производительность

### ❌ Что НЕ делает DOM Patcher:
- НЕ изменяет содержимое виртуализированной таблицы
- НЕ рендерит строки таблицы
- НЕ управляет бизнес-логикой
- НЕ заменяет существующие модули

## Установка зависимостей

```bash
npm install morphdom
```

## Совместимость

- **morphdom**: ^2.7.2
- **Современные браузеры**: ES6+, DOM APIs
- **Существующие модули**: Полная совместимость
- **Виртуализация**: Защищена от изменений

---

# Utils Module — Полная структура

```
utils/
├── domPatcher.js         # Efficient DOM updates with morphdom
├── errorLogger.js        # Centralized error logging
├── metrics.js            # Metric parsing, formatting, anomaly detection
├── date.js               # UTC date parse/format helpers
├── helpers.js            # Common helpers
└── index.js              # Re-exports
```

## Дополнительные модули

### `errorLogger.js`
Централизованное логирование ошибок:

```js
import { logError, logWarn, logDebug, ErrorCategory, LogLevel } from './errorLogger.js';

logError(ErrorCategory.FETCH, 'fetchMetrics', error);
logWarn(ErrorCategory.UI, 'tooltip', 'Element not found');
logDebug(ErrorCategory.STATE, 'store', 'Action dispatched', action);

// Safe wrappers
const result = trySafe(() => riskyOperation(), fallbackValue, ErrorCategory.DOM, 'context');
const asyncResult = await trySafeAsync(asyncFn, fallback, ErrorCategory.FETCH, 'context');
```

### `metrics.js`
Работа с метриками:

```js
import { parseNum, computeDeltaPercent, formatMetricValue, getAnomalyClass } from './metrics.js';

const n = parseNum('1,234.5'); // 1234.5
const delta = computeDeltaPercent(110, 100); // 10
const formatted = formatMetricValue('ASR', 85.567); // 85.6
const cls = getAnomalyClass('ASR', 85, 70, 21); // 'cell-positive'
```

### `date.js`
UTC-даты:

```js
import { parseUtc, formatUtc } from './date.js';

const ts = parseUtc('2024-01-15 10:30:00'); // timestamp ms
const str = formatUtc(ts); // '2024-01-15 10:30:00'
```

## Оптимизации в utils

### domPatcher.js — indexed loop
```js
// Было:
PATCH_EVENTS.forEach(event => eventBus.subscribe(event, () => this._queuePatch()));

// Стало:
const handler = () => this._queuePatch();
const len = PATCH_EVENTS.length;
for (let i = 0; i < len; i++) {
  eventBus.subscribe(PATCH_EVENTS[i], handler);
}
```

### metrics.js — Set для констант
```js
const NO_ANOMALY_METRICS = new Set(['Min', 'SCall', 'TCall']);
const DECIMAL_METRICS = new Set(['ACD', 'ASR']);

// O(1) lookup
if (NO_ANOMALY_METRICS.has(metric)) return '';
```

## Принципы

1. **Централизация** — логирование, парсинг, форматирование
2. **Set для констант** — O(1) поиск
3. **Indexed loops** — для подписок на события
4. **Safe wrappers** — trySafe, trySafeAsync
5. **Защита виртуализации** — PROTECTED_IDS Set
