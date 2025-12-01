# UI Module

Модуль UI-компонентов VoIP Dashboard.

## Архитектура

```
ui/
└── notify.js    # Toast-уведомления
```

## Основные модули

### `notify.js`
Минималистичные toast-уведомления:

```js
import { toast } from './notify.js';

// Показать уведомление
const { dismiss } = toast('Metrics loaded!', { type: 'success', duration: 3000 });

// Закрыть вручную
dismiss();
```

### Типы уведомлений

| Тип | Цвет | Использование |
|-----|------|---------------|
| `info` | Голубой (#0ea5e9) | Информационные сообщения |
| `success` | Зелёный (#10b981) | Успешные операции |
| `warning` | Оранжевый (#f59e0b) | Предупреждения |
| `error` | Красный (#ef4444) | Ошибки |

### API

```js
toast(message, options)
```

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `message` | string | — | Текст уведомления |
| `options.type` | string | 'warning' | Тип: info, success, warning, error |
| `options.duration` | number | 3000 | Длительность в мс |

### Возвращает

```js
{ dismiss: () => void }
```

## Константы

```js
const ANIMATION_DURATION_MS = 160;  // анимация появления/исчезновения
const REMOVE_DELAY_MS = 180;        // задержка перед удалением из DOM
```

## Зависимости

```
ui/
└── utils/errorLogger.js  # logError
```

## Принципы

1. **Минимализм** — простой API, один файл
2. **Автоудаление** — контейнер создаётся при необходимости
3. **Доступность** — role="status" для screen readers
4. **Анимация** — плавное появление/исчезновение через CSS transitions
