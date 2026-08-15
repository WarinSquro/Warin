/**
 * Live builders for My Workspace Daily · Operational Snapshot (FRD ECP-005–012).
 * Reuses allocations / execution health — same sources as reports.
 */

import type { ApiAllocation } from "./domain";
import { addDaysISO, bookedHoursInRange, mondayISO } from "./liveViews";
import type {
  AttentionProject,
  AvailableResource,
  PlanningConflictRow,
  ResourceShortage,
} from "../data/cockpit";
import type { ExecutionRow } from "../data/executionReport";
import type { Employee } from "../data/employees";
import type { Project } from "../data/projects";
import {
  countSkillMatchedStaff,
  staffedEmployeesOnProject,
} from "../data/demandStaffing";
import { isWorkingWeekday } from "../utils/workingCalendar";

function allocationCoversDay(a: ApiAllocation, day: string, workingDays?: string[]): boolean {
  const s = a.startDate.slice(0, 10);
  const e = a.endDate.slice(0, 10);
  return day >= s && day <= e && isWorkingWeekday(day, workingDays);
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * ECP-005/006 — projects needing attention (amber/red).
 * Pass the full execution row set and `projectIdScope = null` so the count matches
 * Execution `preset=attention` (portfolio health only; includes unstaffed projects).
 */
export function buildAttentionProjectsFromLive(
  execRows: ExecutionRow[],
  projectIdScope: Set<string> | null
): AttentionProject[] {
  return execRows
    .filter(
      (r) =>
        (r.health === "red" || r.health === "amber") &&
        (projectIdScope == null || projectIdScope.has(r.projectId))
    )
    .sort((a, b) => {
      const rank = { red: 0, amber: 1, green: 2 } as const;
      return rank[a.health] - rank[b.health] || a.projectName.localeCompare(b.projectName);
    })
    .map((r) => {
      let reason = "Needs management attention";
      if (r.unstaffedException) reason = "Unstaffed · delivery risk";
      else if (r.health === "red") {
        reason =
          (r.confirmationDiscipline ?? 100) < 50
            ? "Critical health · low discipline"
            : "Critical health · low planning accuracy";
      } else if ((r.confirmationDiscipline ?? 100) < 80) {
        reason = "Declining confirmation discipline";
      } else {
        reason = "On watch · delivery risk";
      }
      return {
        projectId: r.projectId,
        projectName: r.projectName,
        health: r.health,
        reason,
      };
    });
}

/**
 * ECP-007/008 — open demand lines not yet staffed on the project in the planning window.
 */
export function buildResourceShortagesFromLive(
  projects: Project[],
  allocations: ApiAllocation[],
  employees: Employee[],
  departments: string[] | null,
  windowFrom: string,
  windowTo: string,
  workingDays?: string[]
): ResourceShortage[] {
  const shortages: ResourceShortage[] = [];

  for (const p of projects) {
    if (p.status !== "active") continue;
    const lines = p.demandLines ?? [];
    if (lines.length === 0) continue;

    const staffedEmps = staffedEmployeesOnProject(
      allocations,
      employees,
      p.id,
      p.name,
      windowFrom,
      windowTo,
      workingDays
    );
    // Preserve full Employee rows for department filtering below.
    const staffedFull = staffedEmps
      .map((s) => employees.find((e) => e.id === s.id))
      .filter((e): e is Employee => !!e);

    if (
      departments &&
      staffedFull.length > 0 &&
      !staffedFull.some((e) => departments.includes(e.department))
    ) {
      continue;
    }

    for (const line of lines) {
      const skillSet = new Set(line.skills.map((s) => s.toLowerCase()));
      const matched = countSkillMatchedStaff(staffedEmps, line.skills);
      const unmet = Math.max(0, line.count - matched);
      if (unmet <= 0) continue;

      const role = line.skills.length > 0 ? line.skills.join(" / ") : "Open role";
      const deptGuess =
        staffedFull.find((e) => departments == null || departments.includes(e.department))
          ?.department ??
        employees.find((e) => e.skills.some((s) => skillSet.has(s.toLowerCase())))
          ?.department ??
        "—";

      if (departments && deptGuess !== "—" && !departments.includes(deptGuess)) {
        const roleInDept = employees.some(
          (e) =>
            departments.includes(e.department) &&
            e.skills.some((s) => skillSet.has(s.toLowerCase()))
        );
        if (!roleInDept) continue;
      }

      shortages.push({
        id: `short-${p.id}-${line.id}`,
        project: p.name,
        role,
        count: unmet,
        byDate: p.startDate ? formatShortDate(p.startDate.slice(0, 10)) : "ASAP",
        department: deptGuess === "—" && departments?.[0] ? departments[0] : deptGuess,
      });
    }
  }

  return shortages.sort((a, b) => a.project.localeCompare(b.project) || a.role.localeCompare(b.role));
}

/**
 * ECP-009/010 — resources with free capacity in the planning window (next 2 weeks).
 */
export function buildAvailableResourcesFromLive(
  employees: Employee[],
  allocations: ApiAllocation[],
  weekCapacityHours: number,
  windowFrom: string,
  windowTo: string,
  hoursPerDay: number,
  workingDays?: string[]
): AvailableResource[] {
  const weekdays: string[] = [];
  for (let d = windowFrom; d <= windowTo; d = addDaysISO(d, 1)) {
    if (isWorkingWeekday(d, workingDays)) weekdays.push(d);
  }
  const windowCapacity = weekdays.length * hoursPerDay;
  const booked = bookedHoursInRange(allocations, windowFrom, windowTo, undefined, workingDays);
  const out: AvailableResource[] = [];

  for (const e of employees.filter((x) => x.status === "active")) {
    const hours = booked.get(e.id)?.hours ?? 0;
    const freeHours = Math.max(0, Math.round((windowCapacity - hours) * 10) / 10);
    if (freeHours < hoursPerDay) continue;

    const thisWeekEnd = addDaysISO(mondayISO(new Date(`${windowFrom}T12:00:00`)), 6);
    const thisWeekBooked =
      bookedHoursInRange(allocations, windowFrom, thisWeekEnd, undefined, workingDays).get(e.id)?.hours ?? 0;
    const thisWeekCap = Math.min(
      weekCapacityHours,
      weekdays.filter((d) => d <= thisWeekEnd).length * hoursPerDay
    );
    let availableFrom = "Now";
    if (thisWeekBooked >= thisWeekCap - 0.01) {
      let found: string | null = null;
      for (const day of weekdays) {
        let dayHours = 0;
        for (const a of allocations) {
          if (a.employeeHrmsId !== e.id) continue;
          if (allocationCoversDay(a, day, workingDays)) dayHours += a.hoursPerDay;
        }
        if (dayHours < hoursPerDay - 0.01) {
          found = day;
          break;
        }
      }
      if (found) availableFrom = formatShortDate(found);
      else continue;
    }

    out.push({
      id: `av-${e.id}`,
      employeeId: e.id,
      name: e.name,
      department: e.department,
      availableFrom,
      freeHours,
    });
  }

  return out.sort((a, b) => {
    if (a.availableFrom === "Now" && b.availableFrom !== "Now") return -1;
    if (b.availableFrom === "Now" && a.availableFrom !== "Now") return 1;
    return a.name.localeCompare(b.name);
  });
}

/** ECP-011/012 — overallocation and same-day multi-project overlaps. */
export function buildPlanningConflictsFromLive(
  employees: Employee[],
  allocations: ApiAllocation[],
  weekCapacityHours: number,
  weekFrom: string,
  weekTo: string,
  hoursPerDay: number,
  workingDays?: string[]
): PlanningConflictRow[] {
  const conflicts: PlanningConflictRow[] = [];

  for (const e of employees.filter((x) => x.status === "active")) {
    const hours = bookedHoursInRange(allocations, weekFrom, weekTo, undefined, workingDays).get(e.id)?.hours ?? 0;
    const mine = allocations.filter((a) => a.employeeHrmsId === e.id);
    const projects = [
      ...new Set(
        mine
          .filter((a) => {
            const s = a.startDate.slice(0, 10);
            const en = a.endDate.slice(0, 10);
            return s <= weekTo && en >= weekFrom;
          })
          .map((a) => a.projectName)
      ),
    ];

    if (hours > weekCapacityHours + 0.01) {
      conflicts.push({
        id: `cf-over-${e.id}`,
        employeeId: e.id,
        employeeName: e.name,
        department: e.department,
        projects,
        conflictType: "Overallocation",
        severity: "high",
        detail: `Booked ${Math.round(hours)}h/wk against ${weekCapacityHours}h capacity for the week of ${formatShortDate(weekFrom)}.`,
      });
    }

    const overlapDays: string[] = [];
    const overloadDays: string[] = [];
    for (let d = weekFrom; d <= weekTo; d = addDaysISO(d, 1)) {
      if (!isWorkingWeekday(d, workingDays)) continue;
      const covering = mine.filter((a) => allocationCoversDay(a, d, workingDays));
      const projectCodes = new Set(covering.map((a) => a.projectCode));
      if (projectCodes.size >= 2) overlapDays.push(d);
      const dayHours = covering.reduce((s, a) => s + a.hoursPerDay, 0);
      if (dayHours > hoursPerDay + 0.01) overloadDays.push(d);
    }

    if (overlapDays.length > 0) {
      const span =
        overlapDays.length === 1
          ? formatShortDate(overlapDays[0]!)
          : `${formatShortDate(overlapDays[0]!)}–${formatShortDate(overlapDays[overlapDays.length - 1]!)}`;
      conflicts.push({
        id: `cf-dbl-${e.id}`,
        employeeId: e.id,
        employeeName: e.name,
        department: e.department,
        projects,
        conflictType: "Double booking",
        severity: "high",
        detail: `Overlapping approved allocations on ${span}.`,
      });
    } else if (overloadDays.length > 0 && hours <= weekCapacityHours + 0.01) {
      conflicts.push({
        id: `cf-cap-${e.id}`,
        employeeId: e.id,
        employeeName: e.name,
        department: e.department,
        projects,
        conflictType: "Capacity warning",
        severity: "medium",
        detail: `Daily allocation exceeds ${hoursPerDay}h capacity on ${overloadDays.length} day(s) this week.`,
      });
    }
  }

  return conflicts.sort((a, b) => {
    const sev = { high: 0, medium: 1 } as const;
    return sev[a.severity] - sev[b.severity] || a.employeeName.localeCompare(b.employeeName);
  });
}

export function planningWindowLabel(from: string, to: string): string {
  return `Next 2 weeks (${formatShortDate(from)} – ${formatShortDate(to)})`;
}
