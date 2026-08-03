import { describe, expect, it } from "vitest";
import { buildOpenDemandFromProjects } from "../../data/planner";
import type { DemandStaffingAllocation, DemandStaffingEmployee } from "../../data/demandStaffing";

const project = {
  id: "PRJ-AMUL",
  name: "Amul",
  status: "active" as const,
  demandLines: [{ id: "dl-react", skills: ["React"], count: 1 }],
};

const employees: DemandStaffingEmployee[] = [
  { id: "EMP-KARAN", status: "active", skills: ["React"] },
  { id: "EMP-JAVA", status: "active", skills: ["Java"] },
];

const windowFrom = "2026-07-27";
const windowTo = "2026-08-28";

function alloc(
  partial: Partial<DemandStaffingAllocation> &
    Pick<DemandStaffingAllocation, "employeeHrmsId" | "projectCode" | "projectName">
): DemandStaffingAllocation {
  return {
    startDate: "2026-07-27",
    endDate: "2026-08-28",
    hoursPerDay: 8,
    ...partial,
  };
}

describe("buildOpenDemandFromProjects staffing filter", () => {
  it("shows demand when no skill-matched staff on project", () => {
    const demands = buildOpenDemandFromProjects([project], {
      allocations: [],
      employees,
      windowFrom,
      windowTo,
    });
    expect(demands).toHaveLength(1);
    expect(demands[0]!.project).toBe("Amul");
    expect(demands[0]!.role).toBe("React");
    expect(demands[0]!.count).toBe(1);
  });

  it("hides demand when enough skill-matched staff are allocated in window", () => {
    const allocations = [
      alloc({
        employeeHrmsId: "EMP-KARAN",
        projectCode: "PRJ-AMUL",
        projectName: "Amul",
      }),
    ];
    const demands = buildOpenDemandFromProjects([project], {
      allocations,
      employees,
      windowFrom,
      windowTo,
    });
    expect(demands).toHaveLength(0);
  });

  it("reduces unmet count when partially staffed", () => {
    const multi = {
      ...project,
      demandLines: [{ id: "dl-react", skills: ["React"], count: 2 }],
    };
    const allocations = [
      alloc({
        employeeHrmsId: "EMP-KARAN",
        projectCode: "PRJ-AMUL",
        projectName: "Amul",
      }),
    ];
    const demands = buildOpenDemandFromProjects([multi], {
      allocations,
      employees,
      windowFrom,
      windowTo,
    });
    expect(demands).toHaveLength(1);
    expect(demands[0]!.count).toBe(1);
  });

  it("does not clear demand when staffed person lacks matching skill", () => {
    const allocations = [
      alloc({
        employeeHrmsId: "EMP-JAVA",
        projectCode: "PRJ-AMUL",
        projectName: "Amul",
      }),
    ];
    const demands = buildOpenDemandFromProjects([project], {
      allocations,
      employees,
      windowFrom,
      windowTo,
    });
    expect(demands).toHaveLength(1);
    expect(demands[0]!.count).toBe(1);
  });

  it("keeps all lines when staffing options are omitted (backward compatible)", () => {
    const demands = buildOpenDemandFromProjects([project]);
    expect(demands).toHaveLength(1);
    expect(demands[0]!.count).toBe(1);
  });
});
