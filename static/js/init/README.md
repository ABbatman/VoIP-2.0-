# Init Module

Модуль инициализации приложения VoIP Dashboard.

## Архитектура

```
init/
├── d3-init.js           # Entry point для графиков (ECharts mode)
├── d3-dashboard.js      # Инициализация дашборда (filters + charts)
└── typeahead-init.js    # Инициализация автодополнения для фильтров
```

## Основные модули

### `d3-init.js`
Entry point для графиков. Создаёт root-контейнер и загружает дашборд:

```js
import { initD3 } from './d3-init.js';

initD3();
// Устанавливает window.__chartsUseEcharts = true
// Создаёт #d3-root контейнер
// Загружает d3-dashboard.js
```

### `d3-dashboard.js`
Инициализация дашборда:
- Фильтры (`initFilters`)
- Контролы графиков (`initChartControls`)
- Рендеринг графика по умолчанию

```js
import { initD3Dashboard } from './d3-dashboard.js';

await initD3Dashboard();
// 1. initFilters()
// 2. ensureDefaults() — регистрация рендереров
// 3. initChartControls()
// 4. renderManager.render('line')
```

### `typeahead-init.js`
Инициализация автодополнения для filter inputs:
- Блокировка browser autofill
- Подключение typeahead к inputs
- Создание dummy datalist

```js
import { initTypeaheadFilters } from './typeahead-init.js';

initTypeaheadFilters();
// Подключает typeahead к:
// - customerInput → /api/suggest/customer
// - supplierInput → /api/suggest/supplier
// - destinationInput → /api/suggest/destination
```

## Оптимизации

### for-in вместо Object.entries().forEach()
```js
// Было:
Object.entries(attrs).forEach(([key, val]) => {
  el.setAttribute(key, val);
});

// Стало:
for (const key in attrs) {
  el.setAttribute(key, attrs[key]);
}
```

### Indexed loops
```js
// Было:
INPUTS.forEach(initInput);

// Стало:
const len = INPUTS.length;
for (let i = 0; i < len; i++) {
  initInput(INPUTS[i]);
}
```

## Конфигурация

### Typeahead inputs
```js
const INPUTS = [
  { id: 'customerInput', kind: 'customer', url: '/api/suggest/customer' },
  { id: 'supplierInput', kind: 'supplier', url: '/api/suggest/supplier' },
  { id: 'destinationInput', kind: 'destination', url: '/api/suggest/destination' }
];
```

### Autofill block attributes
```js
const AUTOFILL_BLOCK_ATTRS = {
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: 'false',
  'data-1p-ignore': 'true',      // 1Password
  'data-lpignore': 'true',       // LastPass
  'data-form-type': 'other',
  'x-autocompletetype': 'off',
  'aria-autocomplete': 'none',
  enterkeyhint: 'search',
  inputmode: 'text',
  type: 'text',
  results: '0',
  autosave: 'off'
};
```

## Порядок инициализации

```
1. initD3()
   └── ensureRootContainer()
   └── loadDashboard()
       └── initD3Dashboard()
           ├── initFilters()
           ├── ensureDefaults()
           ├── initChartControls()
           └── renderManager.render('line')

2. initTypeaheadFilters() (вызывается отдельно)
   ├── ensureEmptyDatalist()
   └── initInput() × 3
       ├── applyNoHistory()
       └── attachTypeahead()
```

## Зависимости

```
init/
├── dom/filters.js           # initFilters
├── charts/ui/chartControls.js  # initChartControls
├── charts/services/renderManager.js  # renderManager
├── charts/registry.js       # ensureDefaults
├── dom/components/typeahead.js  # attachTypeahead
├── state/runtimeFlags.js    # isChartsInitDone, setChartsInitDone
└── utils/errorLogger.js     # logError
```

## Принципы

1. **Guard-clauses** — ранние выходы (`if (isChartsInitDone()) return`)
2. **Lazy loading** — динамический import для d3-dashboard.js
3. **Indexed loops** — для массивов
4. **for-in** — для объектов атрибутов
5. **Без дублирования** — общие хелперы
