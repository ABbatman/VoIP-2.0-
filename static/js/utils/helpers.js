// static/js/helpers.js

/**
 * Calculates a CSS class for a cell based on its value and other anomaly rules.
 * @param {object} params
 * @param {string} params.key - The metric key (e.g., "ASR", "PDD").
 * @param {number} params.value - The value of the metric for today.
 * @param {number} params.yesterdayValue - The value of the metric for yesterday.
 * @param {number|null} params.deltaPercent - The percentage change from yesterday.
 * @returns {string} The CSS class name for highlighting, or an empty string.
 */
export function getAnomalyClass({ key, value, yesterdayValue, deltaPercent }) {
  // ASR anomaly: less than 10%
  if (key === "ASR" && value < 10) {
    return "cell-negative";
  }
  // PDD anomaly: greater than 15 seconds
  if (key === "PDD" && value > 15) {
    return "cell-negative";
  }
  // ATime anomaly: less than 1 second
  if (key === "ATime" && value < 1) {
    return "cell-negative";
  }
  // ACD anomaly: less than 1 second (e.g. 0.5s might indicate issues)
  if (key === "ACD" && value < 1) {
    return "cell-negative";
  }

  // Highlight significant changes compared to yesterday
  if (typeof deltaPercent === "number") {
    if (deltaPercent <= -10) return "cell-negative"; // Decreased by 10% or more
    if (deltaPercent >= 10) return "cell-positive"; // Increased by 10% or more
  }

  // If no specific rule matches, return an empty string (no highlighting).
  return "";
}
