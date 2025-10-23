export function getAnomalyClass({ deltaPercent }) {
  if (typeof deltaPercent === "number" && deltaPercent < -5) {
    return "cell-negative";
  }
  return "";
}
