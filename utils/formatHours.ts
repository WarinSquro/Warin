/**
 * Format hour (or similar float) values for UI display.
 * Collapses binary float noise (e.g. 694.5999999999999 → "694.6")
 * and drops trailing .0 (40.0 → "40").
 */
export function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : parseFloat(value.toFixed(1)).toString();
}

/** Display helper: `694.6h`, `40h`. */
export function formatHoursLabel(value: number, suffix = "h"): string {
  return `${formatHours(value)}${suffix}`;
}

/** Always one decimal: `32.5h`, `2448.0h`. */
export function formatHoursDecimalLabel(value: number, suffix = "h"): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toFixed(1)}${suffix}`;
}
