/**
 * Persist report filter/UI state across browser refresh (sessionStorage).
 * Multi-select lists are reconciled against live options without wiping user picks.
 */

const STORAGE_PREFIX = "warin_report_filters_v1:";

export function loadReportFilters<T extends object>(reportKey: string): Partial<T> | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + reportKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Partial<T>;
  } catch {
    return null;
  }
}

export function saveReportFilters(reportKey: string, state: object): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + reportKey, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Keep the user's multi-select across data reloads.
 * - Empty available → leave selection as-is
 * - Empty selection + available → select all (first populate)
 * - Otherwise keep intersection; if nothing survives, select all
 */
export function reconcileMultiSelect(selected: string[], available: string[]): string[] {
  if (available.length === 0) return selected;
  if (selected.length === 0) return [...available];
  const availableSet = new Set(available);
  const kept = selected.filter((v) => availableSet.has(v));
  return kept.length > 0 ? kept : [...available];
}
