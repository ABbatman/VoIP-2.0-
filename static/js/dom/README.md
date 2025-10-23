# Dashboard Renderer Module

## Обзор

Модуль `renderer.js` отвечает за создание и обновление HTML-каркаса дашборда. Он **НЕ рендерит строки таблицы** - это делает отдельный движок виртуализации. Рендерер создает только структуру и контейнеры.

## Основные компоненты

### 1. **DashboardRenderer** - Основной класс
- Создает полный HTML-каркас дашборда
- Обновляет отдельные части без полного перерендера
- Управляет видимостью таблицы
- Применяет стили на основе состояния

### 2. **Функции-помощники**
- `render(state, container)` - Рендерит полный каркас
- `updateFramework(state)` - Обновляет существующий каркас
- `getVirtualizedTableContainer()` - Получает контейнер для виртуализации

## Структура HTML-каркаса

```
page-container
├── page-title (заголовок страницы)
├── filters-panel (панель фильтров)
├── summary-display (метрики)
├── results-display (секция таблицы)
│   ├── table-controls (управление таблицей)
│   ├── top-scrollbar-container (верхний скроллбар)
│   ├── virtual-scroll-container (контейнер для виртуализации) ⭐
│   │   ├── tableHead (заголовки таблицы)
│   │   ├── tableBody (тело таблицы)
│   │   └── table-footer-info (подвал)
│   └── virtual-scroller-status (статус виртуализации)
├── time-controls (управление временем)
└── overlays (всплывающие элементы)
```

## ⭐ Ключевая особенность: virtual-scroll-container

```html
<div class="results-display__table-wrapper virtual-scroller-container" id="virtual-scroll-container">
  <table id="summaryTable" class="results-display__table">
    <thead id="tableHead"></thead>
    <tbody id="tableBody"></tbody>
    <tfoot>
      <tr>
        <td id="table-footer-info" colspan="24"></td>
      </tr>
    </tfoot>
  </table>
</div>
```

**Важно**: Рендерер создает структуру таблицы, но НЕ заполняет строки. Строки рендерит движок виртуализации.

## API

### Основные методы

#### `render(state, container)`
Рендерит полный HTML-каркас.

```javascript
import { render } from './dom/renderer.js';

const state = {
  app: { filters: { customer: 'Example Corp' } }
};

const container = document.getElementById('dashboard-container');
const result = render(state, container);
```

#### `updateFramework(state)`
Обновляет существующий каркас без полного перерендера.

```javascript
import { updateFramework } from './dom/renderer.js';

const updatedState = {
  app: { filters: { customer: 'Updated Corp' } }
};

updateFramework(updatedState);
```

#### `getVirtualizedTableContainer()`
Получает контейнер для виртуализации.

```javascript
import { dashboardRenderer } from './dom/renderer.js';

const tableContainer = dashboardRenderer.getVirtualizedTableContainer();
if (tableContainer) {
  // Настройте контейнер для движка виртуализации
  tableContainer.setAttribute('data-virtualization-ready', 'true');
}
```

### Управление видимостью

#### `showTable()` / `hideTable()`
Показывает/скрывает секцию таблицы.

```javascript
import { showTable, hideTable } from './dom/renderer.js';

// Скрыть таблицу при загрузке
hideTable();

// Показать таблицу после загрузки данных
setTimeout(() => showTable(), 1000);
```

## Интеграция с состоянием

Рендерер автоматически использует состояние приложения для:

- **Фильтры**: Значения полей ввода (customer, supplier, destination, from, to)
- **Вид дашборда**: Режим (summary/cdr)
- **Базовые настройки**: Тема, язык

## Примеры использования

### Базовое использование

```javascript
import { dashboardRenderer } from './dom/renderer.js';

// Инициализация
dashboardRenderer.initialize();

// Рендеринг
const state = stateManager.getCompleteState();
dashboardRenderer.render(state, 'dashboard-container');
```

### Обновление состояния

```javascript
// При изменении фильтров
subscribe('appState:filtersChanged', (filters) => {
  updateFramework({ app: { filters } });
});
```

### Работа с виртуализацией

```javascript
// Получить контейнер для настройки
const tableContainer = dashboardRenderer.getVirtualizedTableContainer();

if (tableContainer) {
  // Добавить атрибуты для движка виртуализации
  tableContainer.setAttribute('data-row-height', '40');
  tableContainer.setAttribute('data-buffer-size', '5');
  
  // НЕ рендерите строки здесь!
  // Это делает движок виртуализации
}
```

## Стилизация

Рендерер использует минимальные CSS классы для:

- **Базовое оформление**: Заголовки, панели, кнопки
- **Адаптивность**: Мобильные устройства
- **Виртуализация**: Статус и индикаторы

## События

Рендерер автоматически подписывается на события состояния:

- `appState:filtersChanged` - Обновление фильтров
- `appState:dashboardViewChanged` - Изменение вида дашборда

## Важные принципы

### ✅ Что делает рендерер:
- Создает HTML-структуру таблицы
- Обновляет значения полей фильтров
- Применяет CSS классы
- Управляет видимостью секций
- Предоставляет контейнеры для других модулей

### ❌ Что НЕ делает рендерер:
- НЕ рендерит строки таблицы
- НЕ обрабатывает данные
- НЕ управляет виртуализацией
- НЕ создает бизнес-логику

## Интеграция с MetricsDashboardModule

```javascript
import { MetricsDashboardModule } from './core/MetricsDashboardModule.js';

const dashboard = new MetricsDashboardModule();

// Автоматически использует новый рендерер
dashboard.init('dashboard-container');

// Ручной рендеринг
dashboard.render(customState, 'custom-container');

// Обновление фреймворка
dashboard.updateFramework(updatedState);
```

## Отладка

Для отладки рендерера используйте:

```javascript
// Проверить состояние рендерера
console.log('Renderer initialized:', dashboardRenderer.isInitialized);
console.log('Current container:', dashboardRenderer.currentContainer);

// Проверить контейнер виртуализации
const tableContainer = dashboardRenderer.getVirtualizedTableContainer();
console.log('Table container:', tableContainer);

// Проверить CSS классы
console.log('Container classes:', dashboardRenderer.currentContainer?.className);
```

## Производительность

- **Полный рендер**: Только при инициализации или смене контейнера
- **Частичные обновления**: При изменении состояния
- **Кэширование**: Сохранение ссылок на DOM элементы

## Совместимость

Рендерер создает **точно такую же HTML-структуру**, как была в оригинальном коде:

- Те же ID элементов (`tableBody`, `tableHead`, `summaryTable`)
- Те же CSS классы
- Те же атрибуты и стили
- Полная совместимость с существующими модулями
