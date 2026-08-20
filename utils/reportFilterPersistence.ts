/**
 * Report multi-select helpers.
 *
 * Filter selections live in component state while the report is mounted.
 * Leaving the report remounts with all options selected (no sessionStorage restore).
 */

/** @deprecated Legacy prefix — cleared on report mount so old keys cannot leak back. */
const STORAGE_PREFIX = "warin_report_filters_v3:";

export const REPORT_FILTER_STORAGE_KEYS = [
  "daily_work",
  "deployment",
  "performance",
  "execution",
  "workday_summary",
] as const;

/** Remove legacy persisted filters for one report (or all reports when omitted). */
export function clearStoredReportFilters(reportKey?: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (reportKey) {
      sessionStorage.removeItem(STORAGE_PREFIX + reportKey);
      return;
    }
    for (const key of REPORT_FILTER_STORAGE_KEYS) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    /* quota / private mode */
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

/** True when every available option is selected (or both empty). */
export function isAllSelected(selected: string[], available: string[]): boolean {
  if (available.length === 0) return selected.length === 0;
  return sameSet(selected, available);
}

/**
 * First paint of Deployment Report used to auto-select only "Unallocated"
 * before allocations loaded. That is "all", not an explicit project filter.
 */
export function forgetStaleUnallocatedSentinel(
  selected: string[] | null | undefined
): string[] {
  if (!selected || selected.length === 0) return [];
  if (selected.length === 1 && selected[0] === "Unallocated") return [];
  return selected;
}

/**
 * Keep the user's multi-select across data reloads while the report stays mounted.
 * - Empty available → leave selection as-is
 * - Empty selection + available → select all (default)
 * - If selection matched the previous full option list (“all”), stay on all
 * - Otherwise keep intersection; if nothing survives, select all
 */
export function reconcileMultiSelect(
  selected: string[],
  available: string[],
  previousAvailable: string[] = []
): string[] {
  if (available.length === 0) return selected;
  if (selected.length === 0) return [...available];
  /** Lone Unallocated before real projects load — default is all, not a user filter. */
  if (
    selected.length === 1 &&
    selected[0] === "Unallocated" &&
    available.includes("Unallocated") &&
    available.length > 1 &&
    (previousAvailable.length === 0 ||
      (previousAvailable.length === 1 && previousAvailable[0] === "Unallocated"))
  ) {
    return [...available];
  }
  if (previousAvailable.length > 0 && sameSet(selected, previousAvailable)) {
    return [...available];
  }
  const availableSet = new Set(available);
  const kept = selected.filter((v) => availableSet.has(v));
  return kept.length > 0 ? kept : [...available];
}
