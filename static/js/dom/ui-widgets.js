// static/js/dom/ui-widgets.js
// Responsibility: Date/time picker widgets (Flatpickr, time controls)
/* global flatpickr */
import { logError, ErrorCategory } from '../utils/errorLogger.js';
import { setDateManuallyCommittedAt } from '../state/runtimeFlags.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DATE_INPUT_SELECTOR = '.date-part';
const DATE_FORMAT = 'Y-m-d';
const ALT_FORMAT = 'F j, Y';
const CALENDAR_Z_INDEX = '9999';

const DATE_PARSE_FORMATS = [
  'Y-m-d',
  'F j, Y',
  'd.m.Y',
  'd-m-Y',
  'Y/m/d',
  'm/d/Y',
  'd/M/Y'
];

// ─────────────────────────────────────────────────────────────
// Flatpickr helpers
// ─────────────────────────────────────────────────────────────

function parseMultiFormat(dateStr, defaultFormat) {
  if (!dateStr) return undefined;

  const s = String(dateStr).trim();
  const formats = [defaultFormat || DATE_FORMAT, ...DATE_PARSE_FORMATS];

  for (const f of formats) {
    try {
      const d = flatpickr.parseDate(s, f);
      if (d) return d;
    } catch {}
  }

  // compact numeric: 20251002 -> Y-m-d
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    const dt = new Date(Date.UTC(+digits.slice(0, 4), +digits.slice(4, 6) - 1, +digits.slice(6, 8)));
    if (!isNaN(dt.getTime())) return dt;
  }

  // fallback to native
  const nd = new Date(s);
  return isNaN(nd.getTime()) ? undefined : nd;
}

function createCommitHandler(input, fp) {
  return () => {
    const v = input.value.trim();

    if (!v) {
      fp.clear();
      setDateManuallyCommittedAt(Date.now());
      try { input.dataset.userCommittedTs = String(Date.now()); } catch {}
      return { parsed: false, cleared: true };
    }

    fp.setDate(v, true, fp.config.dateFormat);

    if (fp.selectedDates?.[0]) {
      const dateObj = fp.selectedDates[0];
      input.value = fp.formatDate(dateObj, fp.config.dateFormat);
      if (fp.altInput) fp.altInput.value = fp.formatDate(dateObj, fp.config.altFormat);
      setDateManuallyCommittedAt(Date.now());
      try { input.dataset.userCommittedTs = String(Date.now()); } catch {}
      return { parsed: true, cleared: false };
    }

    return { parsed: false, cleared: false };
  };
}

function setupInputListeners(input, fp) {
  const openOnClick = () => { try { fp.open(); } catch {} };
  input.addEventListener('click', openOnClick);
  if (fp.altInput) fp.altInput.addEventListener('click', openOnClick);

  const commit = createCommitHandler(input, fp);

  input.addEventListener('blur', e => {
    const res = commit();
    if (res?.parsed || res?.cleared) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      input.blur();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Flatpickr init
// ─────────────────────────────────────────────────────────────

export function initFlatpickr() {
  if (typeof flatpickr === 'undefined') return;

  document.querySelectorAll(DATE_INPUT_SELECTOR).forEach(input => {
    if (!input || input._flatpickr) return;

    const fp = flatpickr(input, {
      altInput: false,
      altFormat: ALT_FORMAT,
      dateFormat: DATE_FORMAT,
      allowInput: true,
      clickOpens: true,
      disableMobile: true,
      parseDate: (str, fmt) => parseMultiFormat(str, fmt),
      appendTo: document.body,
      positionElement: input,
      onReady(_, __, inst) {
        if (inst?.calendarContainer) {
          inst.calendarContainer.style.zIndex = CALENDAR_Z_INDEX;
        }
      }
    });

    input._flatpickr = fp;
    setupInputListeners(input, fp);
  });
}

// ─────────────────────────────────────────────────────────────
// Time controls
// ─────────────────────────────────────────────────────────────

const TIME_CONTROLS_ID = 'time-controls';
const TIME_INPUT_IDS = ['fromTime', 'toTime'];
const POPUP_Z_INDEX = '10000';
const POPUP_OFFSET = 5;
const HIDE_DELAY = 100;

// time formatting helpers
const pad2 = n => String(n).padStart(2, '0');
const toYmd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toHms = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

function parseYmd(s) {
  const [y, m, d] = (s || '').split('-').map(x => parseInt(x, 10));
  return (y && m && d) ? { y, m, d } : null;
}

function parseHms(s) {
  const [hh, mm, ss] = (s || '').split(':').map(x => parseInt(x, 10));
  return { hh: hh || 0, mm: mm || 0, ss: ss || 0 };
}

export function initTimeControls() {
  const popup = document.getElementById(TIME_CONTROLS_ID);
  if (!popup || popup.dataset.initialized === 'true') return;

  popup.dataset.initialized = 'true';
  popup.tabIndex = -1;

  const timeInputs = TIME_INPUT_IDS.map(id => document.getElementById(id)).filter(Boolean);
  let activeInput = null;
  let clickInProgress = false;

  // position popup under input
  function positionPopup(input) {
    const r = input.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${r.bottom + POPUP_OFFSET}px`;
    popup.style.left = `${r.left}px`;
    popup.style.zIndex = POPUP_Z_INDEX;
  }

  function showPopup(input) {
    activeInput = input;
    popup.style.display = 'flex';
    positionPopup(input);

    popup._scrollHandler = () => positionPopup(input);
    popup._resizeHandler = () => positionPopup(input);
    window.addEventListener('scroll', popup._scrollHandler, true);
    window.addEventListener('resize', popup._resizeHandler);
  }

  function hidePopup() {
    setTimeout(() => {
      const popupHasFocus = popup.contains(document.activeElement);
      const inputHasFocus = timeInputs.some(i => i === document.activeElement);

      if (!popupHasFocus && !inputHasFocus) {
        popup.style.display = 'none';
        activeInput = null;
        if (popup._scrollHandler) window.removeEventListener('scroll', popup._scrollHandler, true);
        if (popup._resizeHandler) window.removeEventListener('resize', popup._resizeHandler);
        popup._scrollHandler = null;
        popup._resizeHandler = null;
      }
    }, HIDE_DELAY);
  }

  // attach focus/blur
  timeInputs.forEach(input => {
    input.addEventListener('focus', () => showPopup(input));
    input.addEventListener('blur', hidePopup);
  });
  popup.addEventListener('blur', hidePopup, true);

  // handle button clicks
  popup.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    const action = btn?.dataset.action;
    if (clickInProgress || !action || !activeInput) return;

    clickInProgress = true;
    e.stopImmediatePropagation();
    e.preventDefault();

    const isFrom = activeInput.id === 'fromTime';
    const dateInput = document.getElementById(isFrom ? 'fromDate' : 'toDate');
    if (!dateInput) {
      clickInProgress = false;
      return;
    }

    if (action === 'zero') {
      activeInput.value = '00:00:00';
    } else if (action === 'now') {
      const now = new Date();
      const ymd = toYmd(now);
      const hms = toHms(now);

      if (dateInput._flatpickr) dateInput._flatpickr.setDate(ymd, false);
      dateInput.value = ymd;
      activeInput.value = hms;
    } else if (action === 'hour-plus' || action === 'hour-minus') {
      const ymdObj = parseYmd(dateInput.value);
      const hmsObj = parseHms(activeInput.value || '00:00:00');

      if (ymdObj) {
        const dt = new Date(ymdObj.y, ymdObj.m - 1, ymdObj.d, hmsObj.hh, hmsObj.mm, hmsObj.ss);
        dt.setHours(dt.getHours() + (action === 'hour-plus' ? 1 : -1));

        const newYmd = toYmd(dt);
        const newHms = toHms(dt);

        if (dateInput._flatpickr) dateInput._flatpickr.setDate(newYmd, false);
        dateInput.value = newYmd;
        activeInput.value = newHms;
      }
    }

    activeInput.focus();
    setTimeout(() => { clickInProgress = false; }, 0);
  });
}
