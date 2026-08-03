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
