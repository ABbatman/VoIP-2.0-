# Workers Module

Модуль Web Workers для off-thread вычислений VoIP Dashboard.

## Архитектура

```
workers/
├── aggregation.worker.js      # Web Worker для агрегации данных
└── aggregationWorkerClient.js # Promise-based клиент для worker
```

## Основные модули

### `aggregationWorkerClient.js`
Promise-based обёртка над Web Worker:

```js
import {
  filterByZoomAsync,
  aggregatePeerRowsAsync,
  aggregateMainRowsAsync,
  fullReaggregationAsync,
  terminateWorker
} from './aggregationWorkerClient.js';

// Фильтрация по zoom-диапазону
const filtered = await filterByZoomAsync(hourlyRows, fromTs, toTs);

// Агрегация peer rows
const peerRows = await aggregatePeerRowsAsync(hourlyRows);

// Агрегация main rows
const mainRows = await aggregateMainRowsAsync(peerRows);

// Полная реагрегация
const { hourlyRows, peerRows, mainRows, aggregates } = await fullReaggregationAsync(hourlyRows, fromTs, toTs);

// Завершение worker
terminateWorker();
```

### `aggregation.worker.js`
Web Worker с message-based API:

```js
// Типы сообщений:
// - FILTER_BY_ZOOM
// - AGGREGATE_PEER_ROWS
// - AGGREGATE_MAIN_ROWS
// - COMPUTE_AGGREGATES
// - FULL_REAGGREGATION
```

## Sync Fallbacks

Если Worker недоступен, клиент автоматически использует синхронные функции:

```js
import {
  filterByZoomSync,
  aggregatePeerRowsSync,
  aggregateMainRowsSync
} from './aggregationWorkerClient.js';
```

## Оптимизации

### Set для O(1) поиска timestamp полей
```js
const TS_FIELDS_SET = new Set([
  'time', 'Time', 'timestamp', 'Timestamp',
  'slot', 'Slot', 'hour', 'Hour',
  'datetime', 'DateTime', 'ts', 'TS'
]);
```

### Fast path для parseRowTs
```js
function parseRowTs(r) {
  // fast path: check common keys first
  let val = r.time ?? r.Time ?? r.timestamp ?? r.slot ?? r.hour ?? r.ts;

  // fallback to full search
  if (val == null) {
    for (const key in r) {
      if (TS_FIELDS_SET.has(key)) {
        val = r[key];
        break;
      }
    }
  }
  // parse val...
}
```

### Indexed loops вместо filter
```js
function filterByZoom(hourlyRows, fromTs, toTs) {
  const result = [];
  const len = hourlyRows.length;
  for (let i = 0; i < len; i++) {
    const r = hourlyRows[i];
    const ts = parseRowTs(r);
    if (ts >= fromTs && ts <= toTs) {
      result.push(r);
    }
  }
  return result;
}
```

## Message Protocol

### Request
```js
{
  type: 'FILTER_BY_ZOOM' | 'AGGREGATE_*' | 'FULL_REAGGREGATION',
  payload: { ... },
  requestId: number
}
```

### Response
```js
// Success
{ type: 'SUCCESS', requestId: number, result: any }

// Error
{ type: 'ERROR', requestId: number, error: string }
```

## Агрегация

### Peer Rows
```
hourlyRows → группировка по (main, peer, destination) → вычисление:
- Min: sum
- SCall: sum
- TCall: sum
- ASR: (SCall / TCall) * 100
- ACD: Min / SCall
- PDD: weighted average by TCall
- ATime: weighted average by SCall
```

### Main Rows
```
peerRows → группировка по (main, destination) → вычисление:
- Min: sum
- SCall: sum
- TCall: sum
- ASR: (SCall / TCall) * 100
- ACD: Min / SCall
```

## Константы

```js
const DEFAULT_TIMEOUT = 10000;  // таймаут запроса к worker
```

## Зависимости

```
workers/
└── (standalone - no imports in worker)

aggregationWorkerClient.js
└── (uses import.meta.url for worker path)
```

## Принципы

1. **Off-thread** — тяжёлые вычисления не блокируют UI
2. **Fallback** — синхронные функции при недоступности Worker
3. **Timeout** — защита от зависших запросов
4. **Map для группировки** — O(1) поиск групп
5. **Set для констант** — O(1) поиск timestamp полей
6. **Fast path** — проверка частых ключей первыми
