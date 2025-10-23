// static/js/utils/date.js
// Date parse/format helpers used across charts and data fetches

// parseUtc: accepts strings like "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD", ISO without Z; returns timestamp (ms) or NaN
export function parseUtc(input) {
  if (!input || typeof input !== 'string') return NaN;
  let iso = input.trim();
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(iso)) {
    const parts = iso.split(/\s+/).filter(Boolean);
    const d = parts[0];
    const t = parts[1] || '00:00:00';
    iso = `${d}T${t}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    iso = `${iso}T00:00:00Z`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(iso) && !/[zZ]$/.test(iso)) {
    iso = iso + 'Z';
  }
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : NaN;
}

// formatUtc: formats timestamp (ms) to "YYYY-MM-DD HH:mm:ss" in UTC
export function formatUtc(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const mm = p(d.getUTCMonth() + 1);
  const dd = p(d.getUTCDate());
  const HH = p(d.getUTCHours());
  const MM = p(d.getUTCMinutes());
  const SS = p(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
}
