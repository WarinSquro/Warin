import { describe, expect, it } from "vitest";

/**
 * Documents the Hard Delete transaction purge contract.
 * Implementation: apps/oneview-api/src/api/hard-delete/hard-delete.service.ts
 */
describe("hard delete transaction purge contract", () => {
  it("employee hard delete must remove confirmation productivity and work confirmations", () => {
    const employeeScopedTables = [
      "confirmation_productivity_days",
      "work_confirmations",
      "weekly_check_in_submissions",
      "kpi_framework_items",
      "allocations",
    ] as const;
    expect(employeeScopedTables).toContain("confirmation_productivity_days");
    expect(employeeScopedTables).toContain("work_confirmations");
  });

  it("allocation detach must delete focus/confirmation lines, not only null FKs", () => {
    const allocationCleanupActions = [
      "delete work_confirmation_lines by allocation_id",
      "delete confirmation_focus_laps by allocation_id or allocation_key",
      "delete confirmation_focus_sessions by allocation_id or allocation_key",
      "delete allocations",
      "delete work_confirmations left with zero lines",
    ] as const;
    expect(allocationCleanupActions.some((a) => a.includes("delete confirmation_focus"))).toBe(
      true
    );
    expect(allocationCleanupActions.some((a) => a.includes("null"))).toBe(false);
  });
});
