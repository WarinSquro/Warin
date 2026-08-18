import { describe, expect, it } from "vitest";
import { isSelfAllocation } from "../../utils/selfAllocation";

describe("isSelfAllocation", () => {
  it("is true when actor and target HRMS ids match", () => {
    expect(isSelfAllocation("111", "111")).toBe(true);
  });

  it("is false for another employee or missing ids", () => {
    expect(isSelfAllocation("111", "112")).toBe(false);
    expect(isSelfAllocation("111", undefined)).toBe(false);
    expect(isSelfAllocation(null, "111")).toBe(false);
  });
});
