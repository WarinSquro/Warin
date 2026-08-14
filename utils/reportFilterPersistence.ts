/**
 * Persist report filter/UI state across browser refresh (sessionStorage).
 * Multi-select lists are reconciled against live options without wiping user picks.
 */

const STORAGE_PREFIX = "warin_report_filters_v3:";

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
 * Persist partial multi-selects only. `null` means “all options” so a later
 * option-list expansion (e.g. projects after allocations load) does not stick
 * on a stale singleton like `["Unallocated"]`.
 */
export function serializeMultiSelect(selected: string[], available: string[]): string[] | null {
  if (selected.length === 0) return null;
  if (available.length === 0) return selected;
  return isAllSelected(selected, available) ? null : selected;
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
 * Keep the user's multi-select across data reloads.
 * - Empty available → leave selection as-is
 * - Empty selection + available → select all (first populate)
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
  /** First paint is often only the Unallocated sentinel; expand when real projects arrive. */
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
