import { describe, expect, it } from "vitest";
import {
  isValidUnplannedReason,
  normalizeUnplannedReason,
  unplannedReasonHint,
  UNPLANNED_WORK_REASONS,
} from "../../data/confirmation";

describe("unplanned work reason", () => {
  it("accepts canonical dropdown values", () => {
    for (const r of UNPLANNED_WORK_REASONS) {
      expect(isValidUnplannedReason(r.value)).toBe(true);
      expect(normalizeUnplannedReason(r.value)).toBe(r.value);
    }
  });

  it("maps legacy placeholders to empty so user must re-select", () => {
    expect(normalizeUnplannedReason("logged")).toBe("");
    expect(normalizeUnplannedReason("Unplanned work")).toBe("");
    expect(normalizeUnplannedReason("  logged  ")).toBe("");
    expect(normalizeUnplannedReason("")).toBe("");
    expect(isValidUnplannedReason("logged")).toBe(false);
  });

  it("maps unknown free-text legacy reasons to empty", () => {
    expect(normalizeUnplannedReason("Electricity Issue")).toBe("");
    expect(isValidUnplannedReason("Electricity Issue")).toBe(false);
  });

  it("returns hint for selected reason", () => {
    expect(unplannedReasonHint("No Allocated Work")).toMatch(/available capacity/i);
    expect(unplannedReasonHint("")).toBeUndefined();
  });
});
