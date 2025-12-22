// static/js/dom/tooltip-manager.js
// Responsibility: Global event delegation for truncation tooltips
import { logError, ErrorCategory } from '../utils/errorLogger.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const TOOLTIP_ID = 'pdd-atime-tooltip';
const HIDDEN_CLASS = 'is-hidden';

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let tooltipEl = null;
let currentTarget = null;

// ─────────────────────────────────────────────────────────────
// DOM Helpers
// ─────────────────────────────────────────────────────────────

function getTooltip() {
    if (!tooltipEl) {
        tooltipEl = document.getElementById(TOOLTIP_ID);
    }
    return tooltipEl;
}

function showTooltip(text, x, y) {
    const el = getTooltip();
    if (!el) return;

    el.textContent = text;
    el.classList.remove(HIDDEN_CLASS);

    // positioning logic to keep it on screen
    const rect = el.getBoundingClientRect();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    let left = x + 10;
    let top = y + 10;

    if (left + rect.width > screenW) {
        left = x - rect.width - 10;
    }
    if (top + rect.height > screenH) {
        top = y - rect.height - 10;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function hideTooltip() {
    const el = getTooltip();
    if (el) {
        el.classList.add(HIDDEN_CLASS);
    }
    currentTarget = null;
}

// ─────────────────────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────────────────────

function handleMouseOver(e) {
    // We are interested in TH, TD, or elements with specific class if needed
    // Check if target is a cell or inside a cell
    const cell = e.target.closest('th, td, .filters-panel__input');

    if (!cell) {
        // if moved out of cell, hide
        if (currentTarget) hideTooltip();
        return;
    }

    // optimization: if same target, do nothing
    if (currentTarget === cell) return;
    currentTarget = cell;

    // Check overflow
    // For inputs, we check value length vs width, but inputs usually scroll.
    // For cells, we check scrollWidth > clientWidth

    // Special case: child might be the one truncated (e.g. .hour-datetime-inner)
    // Special case: check specific inner elements known to truncate
    let checkEl = cell;

    // Priority 1: Date/Time inner part
    const datePart = cell.querySelector('.date-part');
    if (datePart) {
        checkEl = datePart;
    }
    // Priority 2: Header label
    else {
        const thLabel = cell.querySelector('.th-label');
        if (thLabel) {
            checkEl = thLabel;
        }
        // Priority 3: Fallback to cell itself (standard columns)
    }

    // buffer of 1px to avoid false positives due to sub-pixel rendering
    let isTruncated = checkEl.scrollWidth > (checkEl.clientWidth + 1);

    // Header fix: th-label inside flex container (th-left-part) often reports 0 or full width
    // while parent has overflow hidden. Check parent width if not detected on label.
    if (!isTruncated && checkEl.classList.contains('th-label')) {
        const parent = checkEl.parentElement;
        if (parent && parent.classList.contains('th-left-part')) {
            isTruncated = checkEl.scrollWidth > (parent.clientWidth + 1);
        }
    }

    if (isTruncated) {
        // Get text content
        let text = checkEl.textContent.trim();
        // For inputs
        if (checkEl.tagName === 'INPUT') {
            text = checkEl.value;
        }

        if (text) {
            showTooltip(text, e.clientX, e.clientY);
        }
    } else {
        hideTooltip();
    }
}

function handleMouseMove(e) {
    if (currentTarget && !getTooltip()?.classList.contains(HIDDEN_CLASS)) {
        showTooltip(getTooltip().textContent, e.clientX, e.clientY);
    }
}

function handleMouseOut(e) {
    const el = getTooltip();
    if (el && !el.contains(e.relatedTarget)) {
        hideTooltip();
    }
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

export function initTooltipSystem() {
    try {
        // Delegated listener on body to catch all future table updates
        document.body.addEventListener('mouseover', handleMouseOver);
        document.body.addEventListener('mousemove', handleMouseMove);
        document.body.addEventListener('mouseout', (e) => {
            // if leaving the current target
            if (currentTarget && (e.target === currentTarget || e.target.contains(currentTarget))) {
                hideTooltip();
            }
        });
    } catch (e) {
        logError(ErrorCategory.DOM, 'initTooltipSystem', e);
    }
}
