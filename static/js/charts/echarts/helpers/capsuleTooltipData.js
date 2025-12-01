// static/js/charts/echarts/helpers/capsuleTooltipData.js
// Responsibility: data extraction utilities for capsule tooltip
import { logError, ErrorCategory } from '../../../utils/errorLogger.js';

// candidate field names for entity extraction
const NAME_CANDIDATES = [
  'name',
  'customer', 'customername', 'customer_name',
  'client', 'clientname', 'client_name',
  'account', 'buyer',
  'destination', 'destinationname', 'destination_name',
  'direction', 'route', 'route_name',
  'country', 'country_name',
  'dst', 'dst_name', 'prefix', 'prefix_name',
  'peer', 'peername', 'peer_name',
  'provider', 'providername', 'provider_name',
  'supplier', 'suppliername', 'supplier_name',
  'vendor', 'vendorname', 'vendor_name',
  'carrier', 'carriername', 'carrier_name'
];

// normalize iterable to array
export function toArray(value) {
  try {
    if (Array.isArray(value)) return value;
    if (value && typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') {
      return Array.from(value);
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:toArray', e);
  }
  return Array.isArray(value) ? value : [];
}

// extract display name from object using candidate keys
function extractNameFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // direct key match
  for (const key of NAME_CANDIDATES) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) {
      const val = String(obj[key]).trim();
      if (val) return val;
    }
  }

  // case-insensitive fallback
  try {
    const lowerCandidates = new Set(NAME_CANDIDATES.map(x => x.toLowerCase()));
    for (const key of Object.keys(obj)) {
      if (!lowerCandidates.has(key.toLowerCase())) continue;
      const val = obj[key];
      if (val != null) {
        const str = String(val).trim();
        if (str) return str;
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:extractNameFromObject', e);
  }

  return null;
}

// pick compact display name from array
export function pickName(arr) {
  try {
    if (!Array.isArray(arr)) return '—';
    if (arr.length === 0) return '—';
    if (arr.length === 1) {
      if (typeof arr[0] === 'string') return String(arr[0]);
      const name = extractNameFromObject(arr[0]);
      return name || '—';
    }
    return 'Multiple';
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:pickName', e);
    return '—';
  }
}

// get first value-array from map-like structure
export function firstFromMapLike(mapLike, targetKey) {
  try {
    if (!mapLike) return null;

    // Map instance
    if (mapLike instanceof Map) {
      if (targetKey != null && mapLike.has(targetKey)) return toArray(mapLike.get(targetKey));
      for (const [, v] of mapLike) return toArray(v);
      return null;
    }

    // plain object
    if (typeof mapLike === 'object' && !Array.isArray(mapLike)) {
      if (targetKey != null && Object.prototype.hasOwnProperty.call(mapLike, targetKey)) {
        return toArray(mapLike[targetKey]);
      }
      const keys = Object.keys(mapLike);
      if (keys.length) return toArray(mapLike[keys[0]]);
      return null;
    }

    // array of entries/objects
    if (Array.isArray(mapLike)) {
      for (const item of mapLike) {
        if (!item) continue;
        const list = item.values || item.items || item.list || item.arr || item.value || item.customers || item.destinations;
        if (list != null) return toArray(list);
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:firstFromMapLike', e);
  }
  return null;
}

// filter array by supplier name (best-effort)
export function narrowBySupplier(arr, supplierName) {
  try {
    if (!Array.isArray(arr) || !supplierName) return arr;

    const supplierKeys = ['supplier', 'provider', 'vendor', 'carrier', 'peer', 'name', 'supplierName', 'providerName'];
    const matched = [];

    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;

      for (const key of supplierKeys) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        const val = item[key];
        if (val != null && String(val).trim() === String(supplierName)) {
          matched.push(item);
          break;
        }
      }
    }

    return matched.length ? matched : arr;
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:narrowBySupplier', e);
    return arr;
  }
}

// read numeric value from hovered capsule text shape
export function readHoverValueFromEvent(event) {
  try {
    const zrEvent = event?.event;
    let target = zrEvent?.topTarget || zrEvent?.target;

    const readText = (node) => {
      return node?.style?.text && typeof node.style.text === 'string' ? node.style.text : null;
    };

    // climb up and probe children for text glyph
    while (target) {
      const txt = readText(target);
      if (txt) {
        const num = Number(String(txt).replace(/[^0-9.+-]/g, ''));
        return Number.isFinite(num) ? num : null;
      }

      if (Array.isArray(target.children)) {
        for (const child of target.children) {
          const childTxt = readText(child);
          if (childTxt) {
            const num = Number(String(childTxt).replace(/[^0-9.+-]/g, ''));
            return Number.isFinite(num) ? num : null;
          }
        }
      }

      target = target.parent;
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:readHoverValueFromEvent', e);
  }
  return null;
}

// format timestamp to readable label
export function toTimeLabel(ts) {
  try {
    const d = new Date(Number(ts));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:toTimeLabel', e);
    return '';
  }
}

// get top supplier name from suppliers array
export function getTopSupplierName(suppliers) {
  try {
    if (!Array.isArray(suppliers) || !suppliers.length) return null;
    const sorted = suppliers.slice().sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0));
    const top = sorted[0] || {};
    const name = top.name ?? top.supplier ?? top.provider ?? top.id ?? top.supplierId;
    return name != null ? String(name) : null;
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:getTopSupplierName', e);
    return null;
  }
}

// derive top customer name with fallbacks
export function deriveTopCustomer({ customers, suppliers, customersBySupplier, topSupplierName }) {
  // try targeted by top supplier
  try {
    if (topSupplierName && customersBySupplier) {
      const arr = firstFromMapLike(customersBySupplier, topSupplierName);
      if (arr?.length) return pickName([arr[0]]);
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopCustomer', e);
  }

  // try original array
  try {
    const arr = toArray(customers);
    if (arr?.length) return pickName(arr);
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopCustomer', e);
  }

  // try first from map
  try {
    const arr = firstFromMapLike(customersBySupplier, null);
    if (arr?.length) return pickName([arr[0]]);
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopCustomer', e);
  }

  // fallback: read from supplier items
  try {
    if (Array.isArray(suppliers) && suppliers.length) {
      const sorted = suppliers.slice().sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0));
      const keys = ['customer', 'client', 'account', 'buyer', 'customerName', 'customer_name'];
      for (const s of sorted) {
        for (const k of keys) {
          if (s?.[k] != null) {
            const v = String(s[k]).trim();
            if (v) return v;
          }
        }
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopCustomer', e);
  }

  return '—';
}

// derive top destination name with fallbacks
export function deriveTopDestination({ destinations, suppliers, destinationsBySupplier, topSupplierName }) {
  // helper to extract name from destination string
  const extractDestName = (str) => {
    if (typeof str !== 'string') return null;
    const name = str.includes(':') ? str.split(':')[0].trim() : str.trim();
    return name || null;
  };

  // try targeted by top supplier
  try {
    if (topSupplierName && destinationsBySupplier) {
      const arr = firstFromMapLike(destinationsBySupplier, topSupplierName);
      const first = arr?.[0];
      if (typeof first === 'string') {
        const name = extractDestName(first);
        if (name) return name;
      }
      if (first != null) return pickName([first]);
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopDestination', e);
  }

  // try original array
  try {
    const arr = toArray(destinations);
    if (arr?.length) return pickName(arr);
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopDestination', e);
  }

  // try first from map
  try {
    const arr = firstFromMapLike(destinationsBySupplier, null);
    if (arr?.length) {
      const first = arr[0];
      if (typeof first === 'string') {
        const name = extractDestName(first);
        if (name) return name;
      }
      return pickName([first]);
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopDestination', e);
  }

  // fallback: read from supplier items
  try {
    if (Array.isArray(suppliers) && suppliers.length) {
      const sorted = suppliers.slice().sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0));
      const keys = ['destination', 'direction', 'country', 'route', 'dst', 'prefix', 'destinationName', 'destination_name'];
      for (const s of sorted) {
        for (const k of keys) {
          if (s?.[k] != null) {
            const v = String(s[k]).trim();
            if (v) {
              const name = extractDestName(v);
              if (name) return name;
            }
          }
        }
      }
    }
  } catch (e) {
    logError(ErrorCategory.CHART, 'capsuleTooltipData:deriveTopDestination', e);
  }

  return '—';
}
