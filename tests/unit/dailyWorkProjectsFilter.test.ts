import { describe, expect, it } from "vitest";
import {
  dailyWorkProjects,
  filterDailyWorkRows,
  type DailyWorkRow,
} from "../../data/dailyWorkReport";

function row(
  partial: Partial<DailyWorkRow> & Pick<DailyWorkRow, "id" | "employeeName" | "projectName" | "planKind">
): DailyWorkRow {
  return {
    employeeId: "E1",
    department: "Engineering",
    resourceOwnerId: "RO",
    resourceOwnerName: "Digant Shah",
    workDate: "2026-08-21",
    milestoneName: "M6",
    activityName: "Testing",
    tasks: ["Login"],
    confirmation: "Pending",
    ...partial,
  };
}

describe("dailyWorkProjects", () => {
  it("uses Project Master names only — ignores unplanned free-text labels", () => {
    const rows = [
      row({
        id: "1",
        employeeName: "A",
        projectName: "SCIP SA-TA",
        planKind: "Plan",
      }),
      row({
        id: "2",
        employeeName: "B",
        projectName: "HPCL HP Pay Integration with Track and Trace Meeting",
        planKind: "Unplanned",
      }),
      row({
        id: "3",
        employeeName: "C",
        projectName: "IncentivePro-v1",
        planKind: "Plan",
      }),
      row({
        id: "4",
        employeeName: "D",
        projectName: "Product Point discussion",
        planKind: "Unplanned",
      }),
    ];
    expect(
      dailyWorkProjects(rows, ["IncentivePro-v1", "SCIP SA-TA"])
    ).toEqual(["IncentivePro-v1", "SCIP SA-TA"]);
  });

  it("without known names, excludes unplanned free-text from the option list", () => {
    const rows = [
      row({
        id: "1",
        employeeName: "A",
        projectName: "SCIP SA-TA",
        planKind: "Plan",
      }),
      row({
        id: "2",
        employeeName: "B",
        projectName: "Product - Discussion with Parashar Sir",
        planKind: "Unplanned",
      }),
    ];
    expect(dailyWorkProjects(rows)).toEqual(["SCIP SA-TA"]);
  });
});

describe("Daily Work project filter vs unplanned", () => {
  it("keeps unplanned rows when Project Master filters are selected", () => {
    const rows = [
      row({
        id: "plan",
        employeeName: "A",
        projectName: "SCIP SA-TA",
        planKind: "Plan",
      }),
      row({
        id: "other",
        employeeName: "B",
        employeeId: "E2",
        projectName: "IncentivePro-v1",
        planKind: "Plan",
      }),
      row({
        id: "unplanned",
        employeeName: "C",
        employeeId: "E3",
        projectName: "HPCL HP Pay Integration with Track and Trace Meeting",
        planKind: "Unplanned",
      }),
    ];
    const visible = new Set(["E1", "E2", "E3"]);
    const filtered = filterDailyWorkRows(
      rows,
      {
        search: "",
        departments: [],
        projects: ["SCIP SA-TA", "IncentivePro-v1"],
        confirmations: [],
        planKinds: [],
        workDay: null,
      },
      visible
    );
    expect(filtered.map((r) => r.id).sort()).toEqual(["other", "plan", "unplanned"]);
  });

  it("still filters Plan rows by selected project", () => {
    const rows = [
      row({
        id: "plan",
        employeeName: "A",
        projectName: "SCIP SA-TA",
        planKind: "Plan",
      }),
      row({
        id: "other",
        employeeName: "B",
        employeeId: "E2",
        projectName: "IncentivePro-v1",
        planKind: "Plan",
      }),
    ];
    const visible = new Set(["E1", "E2"]);
    const filtered = filterDailyWorkRows(
      rows,
      {
        search: "",
        departments: [],
        projects: ["SCIP SA-TA"],
        confirmations: [],
        planKinds: [],
        workDay: null,
      },
      visible
    );
    expect(filtered.map((r) => r.id)).toEqual(["plan"]);
  });
});
