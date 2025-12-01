// static/js/utils/date.js
// Responsibility: UTC date parse/format helpers

// ─────────────────────────────────────────────────────────────
// Patterns
// ─────────────────────────────────────────────────────────────

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_NO_Z_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const pad2 = n => String(n).padStart(2, '0');

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

// parse "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD", ISO without Z → timestamp (ms) or NaN
export function parseUtc(input) {
  if (!input || typeof input !== 'string') return NaN;

  let iso = input.trim();

  if (DATE_TIME_PATTERN.test(iso)) {
    const [date, time = '00:00:00'] = iso.split(/\s+/).filter(Boolean);
    iso = `${date}T${time}Z`;
  } else if (DATE_ONLY_PATTERN.test(iso)) {
    iso = `${iso}T00:00:00Z`;
  } else if (ISO_NO_Z_PATTERN.test(iso) && !/[zZ]$/.test(iso)) {
    iso += 'Z';
  }

  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : NaN;
}

// format timestamp (ms) → "YYYY-MM-DD HH:mm:ss" in UTC
export function formatUtc(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';

  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
         `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}
