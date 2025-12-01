# Charts Module

Модуль визуализации данных на графиках ECharts.

## Архитектура

```
charts/
├── echarts/
│   ├── builders/           # Построители опций ECharts
│   │   └── MultiLineBuilder.js
│   ├── helpers/            # Утилиты для графиков
│   │   ├── barChartConfig.js    # Конфигурация bar chart
│   │   ├── barChartData.js      # Подготовка данных для bar chart
│   │   ├── capsuleTooltip.js    # DOM-тултип для capsule labels
│   │   ├── capsuleTooltipData.js # Извлечение данных для тултипа
│   │   ├── colors.js            # Цветовые константы
│   │   ├── dataTransform.js     # Трансформация данных
│   │   ├── format.js            # Форматирование чисел/дат
│   │   ├── labelOverlay.js      # Overlay-лейблы для bar chart
│   │   ├── time.js              # Работа со временем
│   │   └── tooltip.js           # Конфигурация тултипов
│   ├── renderer/           # Рендереры графиков
│   │   └── EchartsRenderer.js   # Базовый рендерер ECharts
│   └── services/           # Сервисы
│       └── zoomManager.js       # Управление zoom
├── controls/               # UI-контролы
│   └── providerStackControl.js  # Переключатель Suppliers
├── engine/                 # Движок обработки данных
│   └── timeSeriesEngine.js      # Binning и агрегация временных рядов
├── ui/                     # UI-компоненты
│   └── chartControls.js         # Dropdown контролы
├── echartsRenderer.js      # Регистрация ECharts рендереров
├── echartsBarChart.js      # Bar chart рендерер
├── tooltipBar.js           # Overlay тултип для bar chart
└── registry.js             # Реестр типов графиков
```

## Основные модули

### `echartsRenderer.js`
Регистрация и рендеринг ECharts графиков:

```js
import { registerEchartsRenderers } from './echartsRenderer.js';

await registerEchartsRenderers();
// Регистрирует: 'line', 'bar'
```

### `EchartsRenderer.js`
Базовый класс рендерера с общими хелперами:

```js
import {
  ensureContainer,
  hasDimensions,
  waitForDimensions,
  disposeExisting,
  isDisposed
} from './echarts/renderer/EchartsRenderer.js';

const el = ensureContainer('#chart', 'MyRenderer');
await waitForDimensions(el);
disposeExisting(el);
```

### `timeSeriesEngine.js`
Движок временных рядов:
- Binning данных по интервалам
- Агрегация метрик (TCalls, ASR, Minutes, ACD)
- Генерация серий для ECharts

```js
import { aggregateTimeSeries } from './engine/timeSeriesEngine.js';

const series = aggregateTimeSeries(rows, {
  fromTs: 1700000000000,
  toTs: 1700100000000,
  stepMs: 3600000, // 1 hour
  metrics: ['TCalls', 'ASR', 'Minutes', 'ACD']
});
```

### `dataTransform.js`
Трансформация данных:
- Определение ключа провайдера
- Группировка по провайдерам
- Сбор уникальных значений

```js
import { detectProviderKey, groupByProvider } from './echarts/helpers/dataTransform.js';

const providerKey = detectProviderKey(rows);
const grouped = groupByProvider(rows, providerKey);
```

### `barChartData.js`
Подготовка данных для bar chart:
- Построение colorMap
- Извлечение ID/Name из объектов
- Построение лейблов

```js
import { buildColorMap, buildLabelsEffective } from './echarts/helpers/barChartData.js';

const colorMap = buildColorMap(rows);
const labels = buildLabelsEffective(rows);
```

## Оптимизации

### Set для O(1) поиска констант
```js
// dataTransform.js
const PROVIDER_KEY_CANDIDATES = new Set([
  'supplier', 'Supplier', 'provider', 'Provider', ...
]);
const PROVIDER_KEY_CANDIDATES_LOWER = new Set(
  Array.from(PROVIDER_KEY_CANDIDATES).map(k => k.toLowerCase())
);

// Вместо Array.includes() используем Set.has()
if (PROVIDER_KEY_CANDIDATES_LOWER.has(key.toLowerCase())) { ... }
```

### Fast path для частых ключей
```js
// timeSeriesEngine.js
function getRowTimestamp(row) {
  // fast path: check common keys first
  let val = row.time ?? row.Time ?? row.timestamp ?? row.slot ?? row.hour ?? row.ts;
  
  // fallback to full search
  if (val == null) {
    for (const key of Object.keys(row)) {
      if (TIME_KEYS_SET.has(key)) {
        val = row[key];
        break;
      }
    }
  }
  return parseTimestamp(val);
}
```

### Единая функция для bins
```js
// timeSeriesEngine.js
function createAllBins(binCount, alignedFrom, stepMs) {
  const bins = {
    TCalls: [],
    ASR: [],
    Minutes: [],
    ACD: []
  };
  
  for (let i = 0; i < binCount; i++) {
    const ts = alignedFrom + i * stepMs;
    bins.TCalls.push({ ts, sum: 0, count: 0 });
    bins.ASR.push({ ts, sum: 0, count: 0 });
    bins.Minutes.push({ ts, sum: 0, count: 0 });
    bins.ACD.push({ ts, sum: 0, count: 0 });
  }
  
  return bins;
}
```

### Map для дедупликации
```js
// timeSeriesEngine.js - binsToSeries
function binsToSeries({ binsArr, ... }) {
  const seen = new Map(); // O(1) дедупликация
  
  for (let i = 0; i < binCount; i++) {
    const bin = binsArr[i];
    const ts = bin.ts;
    if (ts < fromTs || ts > toTs) continue;
    
    const val = isAverage && bin.count > 0 ? bin.sum / bin.count : bin.sum;
    seen.set(ts, val); // перезаписывает дубликаты
  }
  
  // sort by timestamp
  return Array.from(seen.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, val]) => [ts, val]);
}
```

### Общие хелперы между рендерерами
```js
// EchartsRenderer.js экспортирует общие функции
export function ensureContainer(container, tag = 'EchartsRenderer') { ... }
export function hasDimensions(el) { ... }
export function waitForDimensions(el, maxWait = 1000) { ... }
export function disposeExisting(el) { ... }
export function isDisposed(chart) { ... }

// echartsRenderer.js импортирует и переиспользует
import {
  ensureContainer as ensureContainerBase,
  hasDimensions,
  waitForDimensions,
  disposeExisting,
  isDisposed
} from './echarts/renderer/EchartsRenderer.js';

const ensureContainer = (container) => ensureContainerBase(container, 'echartsRenderer');
```

### Оптимизированный extractNameFromObject
```js
// capsuleTooltipData.js, labelOverlay.js
const NAME_CANDIDATES = new Set(['name', 'supplier', 'provider', ...]);
const NAME_CANDIDATES_LOWER = new Set(
  Array.from(NAME_CANDIDATES).map(k => k.toLowerCase())
);

function extractNameFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  
  // fast path for common keys
  if (obj.name != null) return String(obj.name);
  if (obj.supplier != null) return String(obj.supplier);
  if (obj.provider != null) return String(obj.provider);
  
  // fallback to full search
  for (const key of Object.keys(obj)) {
    if (NAME_CANDIDATES_LOWER.has(key.toLowerCase())) {
      const val = obj[key];
      if (val != null) return String(val);
    }
  }
  return null;
}
```

## События

| Событие | Источник | Описание |
|---------|----------|----------|
| `charts:renderRequest` | filters | Запрос на рендеринг графиков |
| `charts:intervalChanged` | chartControls | Изменение интервала (5m/1h) |
| `charts:zoomChanged` | zoomManager | Изменение zoom-диапазона |
| `charts:typeChanged` | chartControls | Изменение типа графика |

## Типы графиков

| Тип | Файл | Описание |
|-----|------|----------|
| `line` | echartsRenderer.js | Multi-line chart с 4 метриками |
| `bar` | echartsBarChart.js | Stacked bar chart по провайдерам |

## Зависимости

```
charts/
├── state/          # appState, eventBus, runtimeFlags
├── utils/          # errorLogger
└── echarts         # ECharts library (external)
```

## Конфигурация

### Цвета провайдеров
```js
// colors.js
const PROVIDER_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', ...
];

export function getProviderColor(index) {
  return PROVIDER_COLORS[index % PROVIDER_COLORS.length];
}
```

### Интервалы
```js
// time.js
export function getStepMs(interval) {
  switch (interval) {
    case '5m': return 5 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}
```

## Тестирование

```bash
npm test -- --testPathPattern="charts"
```

## Принципы

1. **Set/Map для O(1)** — константы и индексы
2. **Fast path** — проверка частых ключей первыми
3. **Кэширование** — результаты extractName, bins
4. **Единый проход** — createAllBins вместо 4x createEmptyBins
5. **Переиспользование** — общие хелперы в EchartsRenderer.js
6. **Без дублирования** — collectUniquesByKey вместо 2 функций
