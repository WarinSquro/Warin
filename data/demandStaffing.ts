/**
 * Shared demand-line staffing helpers for Open Demand and Resource Shortage.
 * Kept in `data/` so planner mocks do not import `api/`.
 */

export type DemandStaffingAllocation = {
  employeeHrmsId: string;
  projectCode: string;
  projectName: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
};

export type DemandStaffingEmployee = {
  id: string;
  status: string;
  skills: string[];
};

function isWeekday(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00`).getDay();
  return dow >= 1 && dow <= 5;
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function allocationCoversDay(a: DemandStaffingAllocation, day: string): boolean {
  const s = a.startDate.slice(0, 10);
  const e = a.endDate.slice(0, 10);
  return day >= s && day <= e && isWeekday(day);
}

/** Active employees with any weekday hours on the project inside [windowFrom, windowTo]. */
export function staffedEmployeesOnProject(
  allocations: DemandStaffingAllocation[],
  employees: DemandStaffingEmployee[],
  projectId: string,
  projectName: string,
  windowFrom: string,
  windowTo: string
): DemandStaffingEmployee[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const staffed = new Set<string>();

  for (const a of allocations) {
    if (a.projectCode !== projectId && a.projectName !== projectName) continue;
    let hours = 0;
    for (let d = windowFrom; d <= windowTo; d = addDaysISO(d, 1)) {
      if (!allocationCoversDay(a, d)) continue;
      hours += a.hoursPerDay;
    }
    if (hours <= 0) continue;
    staffed.add(a.employeeHrmsId);
  }

  return [...staffed]
    .map((id) => empById.get(id))
    .filter((e): e is DemandStaffingEmployee => !!e && e.status === "active");
}

/** Exact case-insensitive skill match — same rule as cockpit Resource Shortage. */
export function countSkillMatchedStaff(
  staffed: DemandStaffingEmployee[],
  demandSkills: string[]
): number {
  const skillSet = new Set(demandSkills.map((s) => s.toLowerCase()));
  return staffed.filter((e) => e.skills.some((s) => skillSet.has(s.toLowerCase()))).length;
}

/** Unmet headcount for a demand line after skill-matched staffing. */
export function unmetDemandHeadcount(
  lineCount: number,
  demandSkills: string[],
  allocations: DemandStaffingAllocation[],
  employees: DemandStaffingEmployee[],
  projectId: string,
  projectName: string,
  windowFrom: string,
  windowTo: string
): number {
  const staffed = staffedEmployeesOnProject(
    allocations,
    employees,
    projectId,
    projectName,
    windowFrom,
    windowTo
  );
  const matched = countSkillMatchedStaff(staffed, demandSkills);
  return Math.max(0, lineCount - matched);
}
