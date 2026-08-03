import { describe, expect, it } from "vitest";
import { buildAttentionProjectsFromLive } from "../../api/cockpitDaily";
import type { ExecutionRow } from "../../data/executionReport";

function row(partial: Partial<ExecutionRow> & Pick<ExecutionRow, "projectId" | "projectName" | "health">): ExecutionRow {
  return {
    id: `ex-${partial.projectId}`,
    projectType: "paid",
    department: "—",
    resourceOwnerId: "",
    resourceOwnerName: "—",
    planningAccuracy: undefined,
    confirmationDiscipline: undefined,
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    resourceCount: 0,
    executionStatus: "active",
    unstaffedException: true,
    ...partial,
  };
}

describe("buildAttentionProjectsFromLive", () => {
  it("includes unstaffed amber/red projects when scope is null (matches Execution preset=attention)", () => {
    const rows = [
      row({ projectId: "PRJ-001", projectName: "Amul", health: "amber", unstaffedException: true }),
      row({ projectId: "PRJ-002", projectName: "Healthy Co", health: "green", resourceCount: 2, unstaffedException: false }),
      row({ projectId: "PRJ-003", projectName: "Critical", health: "red", resourceCount: 1, unstaffedException: false }),
    ];
    const attention = buildAttentionProjectsFromLive(rows, null);
    expect(attention.map((p) => p.projectId).sort()).toEqual(["PRJ-001", "PRJ-003"]);
  });

  it("still respects an explicit projectIdScope when provided", () => {
    const rows = [
      row({ projectId: "PRJ-001", projectName: "Amul", health: "amber" }),
      row({ projectId: "PRJ-003", projectName: "Critical", health: "red" }),
    ];
    const attention = buildAttentionProjectsFromLive(rows, new Set(["PRJ-003"]));
    expect(attention.map((p) => p.projectId)).toEqual(["PRJ-003"]);
  });
});
