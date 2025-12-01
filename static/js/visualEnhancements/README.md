# Visual Enhancements Module

Модуль визуальных улучшений для таблиц и графиков VoIP Dashboard.

## Архитектура

```
visualEnhancements/
├── adaptiveMarkers.js    # Адаптивные маркеры для bar chart
├── heatmapStyling.js     # Цветовая стилизация метрик (heatmap)
├── hierarchyGuides.js    # CSS-гайды для иерархии строк
├── microCharts.js        # SVG sparklines и sparkbars
└── visualMapping.js      # Математика визуальной стабильности
```

## Основные модули

### `adaptiveMarkers.js`
Адаптивные маркеры для bar chart с автоматическим выбором стиля:

```js
import { getAdaptiveMarkerState, calculateMarkerLayout } from './adaptiveMarkers.js';

// Определение состояния маркера по ширине бара
const state = getAdaptiveMarkerState(barWidth);
// STATE.DOT | STATE.SMALL_PILL | STATE.MEDIUM_PILL | STATE.FULL_CAPSULE

// Расчёт layout для ECharts custom series
const children = calculateMarkerLayout(api, {
  ts, grouped, metric, stepMs, yPos, h, secondary, colorMap,
  formatMetricText, CSS_BG, getStableColor, PROVIDER_COLORS, echarts
});
```

### `heatmapStyling.js`
Цветовая стилизация метрик:

```js
import { getHeatmapStyle, getHeatmapColor } from './heatmapStyling.js';

// CSS стиль для таблицы
const style = getHeatmapStyle('ASR', 45);
// "background-color: rgba(255, 149, 0, 0.15);"

// Цвет для графика
const color = getHeatmapColor('ASR', 45);
// "rgba(255, 149, 0, 0.8)"
```

### `hierarchyGuides.js`
CSS-гайды для визуализации иерархии строк:

```js
import { getHierarchyVisuals, getHierarchyIndent, injectHierarchyStyles } from './hierarchyGuides.js';

// Инъекция стилей
injectHierarchyStyles();

// Получение класса
const className = getHierarchyVisuals('peer'); // "visual-guide-peer"

// Получение inline стиля
const style = getHierarchyIndent('peer'); // "padding-left: 24px; position: relative;"
```

### `microCharts.js`
SVG sparklines и sparkbars для ячеек таблицы:

```js
import { generateSparkline, generateSparkbar } from './microCharts.js';

// Sparkline
const svg = generateSparkline([10, 20, 15, 30, 25], {
  width: 60, height: 20, color: '#4f86ff'
});

// Sparkbar
const html = generateSparkbar(75, 100, {
  width: 40, height: 4, color: '#4f86ff'
});
```

### `visualMapping.js`
Математика визуальной стабильности:

```js
import {
  clamp, mapLinear, mapSmooth,
  detectTimeScale, getZoomStrength,
  getBarWidth, getPointDensity,
  getBarVisuals, getLineVisuals
} from './visualMapping.js';

// Базовые функции
const value = clamp(x, 0, 100);
const mapped = mapLinear(x, 0, 100, 0, 1);
const smooth = mapSmooth(x, 0, 100, 0, 1); // easeInOutCubic

// Определение масштаба времени
const scale = detectTimeScale(rangeMs);
// 'hour' | '5min' | 'mixed' | 'daily' | 'auto'

// Сила зума
const strength = getZoomStrength(currentRangeMs, totalRangeMs);

// Визуальные параметры
const { blueOpacity, grayOpacity, blueWidth, grayWidth } = getBarVisuals(barWidth, scale);
const { lineWidth, smoothStrength } = getLineVisuals(zoomStrength, pointDensity, scale);
```

## Цветовые схемы

### Heatmap (ASR)
| Значение | Цвет |
|----------|------|
| < 10% | Красный |
| 10-30% | Оранжевый |
| > 60% | Зелёный |

### Heatmap (ACD)
| Значение | Цвет |
|----------|------|
| > 5 мин | Синий (сильный) |
| 2-5 мин | Синий (светлый) |

### Adaptive Markers
| Ширина бара | Стиль |
|-------------|-------|
| < 6px | DOT |
| 6-12px | SMALL_PILL |
| 12-22px | MEDIUM_PILL |
| ≥ 22px | FULL_CAPSULE |

## Оптимизации

### Pre-calculate common values
```js
// adaptiveMarkers.js
const dx = actualBarWidth * 0.6;
const len = grouped.length;

for (let i = 0; i < len; i++) {
  const x = Math.round(c[0] - dx); // dx уже вычислен
}
```

## Константы

```js
// adaptiveMarkers.js
const THRESHOLD = { FULL: 22, MEDIUM: 12, SMALL: 6 };

// visualMapping.js
const HOUR_MS = 3600000;

// microCharts.js
const DEFAULTS = {
  sparkline: { width: 60, height: 20, color: '#4f86ff' },
  sparkbar: { width: 40, height: 4, color: '#4f86ff' }
};
```

## Зависимости

```
visualEnhancements/
├── adaptiveMarkers.js
│   ├── visualMapping.js (clamp)
│   └── utils/errorLogger.js
├── heatmapStyling.js
│   └── (standalone)
├── hierarchyGuides.js
│   └── (standalone)
├── microCharts.js
│   └── (standalone)
└── visualMapping.js
    └── (standalone)
```

## Принципы

1. **Standalone** — большинство модулей не имеют зависимостей
2. **Чистые функции** — без side-effects
3. **Адаптивность** — визуалы адаптируются к размерам
4. **Easing** — плавные переходы через mapSmooth
5. **CSS injection** — стили инъектируются один раз
