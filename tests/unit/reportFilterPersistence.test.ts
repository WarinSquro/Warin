import { describe, expect, it, vi } from "vitest";
import {
  clearStoredReportFilters,
  isAllSelected,
  reconcileMultiSelect,
} from "../../utils/reportFilterPersistence";

describe("reportFilterPersistence", () => {
  it("selects all options by default when the available list arrives", () => {
    expect(reconcileMultiSelect([], ["A", "B"], [])).toEqual(["A", "B"]);
  });

  it("keeps an explicit subset across option-list reloads", () => {
    expect(reconcileMultiSelect(["A"], ["A", "B", "C"], ["A", "B"])).toEqual(["A"]);
  });

  it("expands to all when the prior selection matched the full previous list", () => {
    expect(reconcileMultiSelect(["A", "B"], ["A", "B", "C"], ["A", "B"])).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("detects all-selected state", () => {
    expect(isAllSelected(["A", "B"], ["A", "B"])).toBe(true);
    expect(isAllSelected(["A"], ["A", "B"])).toBe(false);
  });

  it("clears legacy sessionStorage keys", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    sessionStorage.setItem("warin_report_filters_v3:daily_work", '{"search":"x"}');
    clearStoredReportFilters("daily_work");
    expect(sessionStorage.getItem("warin_report_filters_v3:daily_work")).toBeNull();
    vi.unstubAllGlobals();
  });
});
