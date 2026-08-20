import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { multiSelectSignature, readReportPage, writeReportPage } from "../../utils/reportPage";

describe("reportPage", () => {
  const key = "unit_test_report";
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("multiSelectSignature is order-independent", () => {
    expect(multiSelectSignature(["b", "a"])).toBe(multiSelectSignature(["a", "b"]));
  });

  it("persists and restores page number", () => {
    expect(readReportPage(key)).toBe(1);
    writeReportPage(key, 3);
    expect(readReportPage(key)).toBe(3);
  });
});
