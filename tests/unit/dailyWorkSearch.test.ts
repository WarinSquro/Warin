import { describe, expect, it } from "vitest";
import { filterDailyWorkRows, type DailyWorkRow } from "../../data/dailyWorkReport";

function row(partial: Partial<DailyWorkRow> & Pick<DailyWorkRow, "id" | "employeeName">): DailyWorkRow {
  return {
    employeeId: "E1",
    department: "Engineering",
    resourceOwnerId: "RO",
    resourceOwnerName: "Digant Shah",
    workDate: "2026-08-20",
    projectName: "SCIP SA-TA",
    milestoneName: "M6",
    activityName: "Testing",
    tasks: ["Login"],
    confirmation: "Pending",
    planKind: "Plan",
    ...partial,
  };
}

describe("Daily Work search", () => {
  it("matches employee name only (not project, tasks, or RO)", () => {
    const rows = [
      row({ id: "1", employeeName: "Atul Karathiya", projectName: "SCIP SA-TA", tasks: ["Login"] }),
      row({ id: "2", employeeId: "E2", employeeName: "Bhavik Kotadiya", projectName: "IncentivePro" }),
    ];
    const visible = new Set(["E1", "E2"]);
    const base = {
      search: "",
      departments: [] as string[],
      projects: [] as string[],
      confirmations: [] as never[],
      planKinds: [] as never[],
      workDay: null as number | null,
    };
    expect(filterDailyWorkRows(rows, { ...base, search: "SCIP" }, visible)).toHaveLength(0);
    expect(filterDailyWorkRows(rows, { ...base, search: "Login" }, visible)).toHaveLength(0);
    expect(filterDailyWorkRows(rows, { ...base, search: "Digant" }, visible)).toHaveLength(0);
    expect(filterDailyWorkRows(rows, { ...base, search: "Atul" }, visible).map((r) => r.id)).toEqual(["1"]);
  });
});
