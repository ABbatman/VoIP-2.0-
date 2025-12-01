// static/js/utils/helpers.js
// Responsibility: Generic utility helpers

const NEGATIVE_THRESHOLD = -5;

export const getAnomalyClass = ({ deltaPercent }) =>
  typeof deltaPercent === 'number' && deltaPercent < NEGATIVE_THRESHOLD ? 'cell-negative' : '';
