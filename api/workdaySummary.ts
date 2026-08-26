import type { Employee } from "../data/employees";
import type { ApiAllocation, ApiConfirmation, ApiTeamProductivityDay } from "./domain";
import type { ConfirmationCode, WorkdaySummaryRow } from "../data/workdaySummaryReport";
import { addDaysISO } from "../utils/date";
import { isConfirmationDelayed } from "../utils/confirmationDelay";
import { focusElapsedMsForWorkDate, workdayDurationMs, type WorkdayMarks } from "../utils/confirmationProductivity";
import { isWorkingWeekday } from "../utils/workingCalendar";

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

function allocationCoversDay(a: ApiAllocation, day: string, workingDays?: string[]): boolean {
  const s = isoDay(a.startDate);
  const e = isoDay(a.endDate);
  return day >= s && day <= e && isWorkingWeekday(day, workingDays);
}

function hoursFromMs(ms: number): number {
  return Math.round((ms / 3600000) * 100) / 100;
}

/** Team-compliance codes: C / CD / D / DD / Pending. Missing source → undefined (shown as —). */
export function workdayComplianceCode(
  confirmation: ApiConfirmation | undefined,
  workDate: string,
  todayIso: string,
  isWorking: boolean
): ConfirmationCode | undefined {
  if (workDate > todayIso) return undefined;
  if (confirmation) {
    const delayed = isConfirmationDelayed(confirmation.submittedAt, workDate);
    if (confirmation.hasDeviation) return delayed ? "DD" : "D";
    return delayed ? "CD" : "C";
  }
  if (!isWorking) return undefined;
  return "Pending";
}

/**
 * Keep a confirmation only when it still has at least one live signal:
 * unplanned lines, or planned lines whose allocation still exists.
 */
function confirmationStillLive(
  confirmation: ApiConfirmation,
  activeAllocIds: Set<string>
): boolean {
  if (!confirmation.lines.length) return true;
  return confirmation.lines.some((l) => {
    if (l.kind === "unplanned") return true;
    if (l.allocationId == null || String(l.allocationId).trim() === "") return true;
    return activeAllocIds.has(String(l.allocationId).trim());
  });
}

export function buildWorkdaySummaryRows(
  employees: Employee[],
  allocations: ApiAllocation[],
  confirmations: ApiConfirmation[],
  productivity: ApiTeamProductivityDay[],
  rangeFrom: string,
  rangeTo: string,
  workingDays?: string[],
  todayIso?: string,
  /** Full employee list for Resource Owner name lookup when rows are hierarchy-scoped. */
  nameLookupEmployees?: Employee[]
): WorkdaySummaryRow[] {
  const today = (todayIso ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const nameSource = nameLookupEmployees?.length ? nameLookupEmployees : employees;
  const nameById = new Map(nameSource.map((e) => [e.id, e.name]));
  const activeAllocIds = new Set(allocations.map((a) => String(a.id)));
  const prodByEmpDay = new Map<string, ApiTeamProductivityDay>();
  for (const p of productivity) {
    prodByEmpDay.set(`${p.employeeHrmsId}:${p.workDate}`, p);
  }
  const confByEmpDay = new Map<string, ApiConfirmation>();
  for (const c of confirmations) {
    if (!confirmationStillLive(c, activeAllocIds)) continue;
    confByEmpDay.set(`${c.employeeHrmsId}:${c.workDate}`, c);
  }
  const allocByEmp = new Map<string, ApiAllocation[]>();
  for (const a of allocations) {
    const list = allocByEmp.get(a.employeeHrmsId) ?? [];
    list.push(a);
    allocByEmp.set(a.employeeHrmsId, list);
  }

  const rows: WorkdaySummaryRow[] = [];
  for (const emp of employees) {
    const mineAlloc = allocByEmp.get(emp.id) ?? [];
    for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
      const key = `${emp.id}:${d}`;
      const conf = confByEmpDay.get(key);
      const covering = mineAlloc.filter((a) => allocationCoversDay(a, d, workingDays));
      const allotted = covering.reduce((s, a) => s + a.hoursPerDay, 0);
      // Day Start (and other workday stamps) count even with no allocation or confirmation.
      const prod = prodByEmpDay.get(key);

      const marks: WorkdayMarks = prod?.workday ?? {};
      const { officeMs, productiveMs } = workdayDurationMs(marks);
      const hasTimes = Boolean(marks.dayStart && marks.dayEnd);

      let focusMs = 0;
      if (prod?.focusByAllocation) {
        for (const st of Object.values(prod.focusByAllocation)) {
          focusMs += focusElapsedMsForWorkDate(st, d, {
            dayEndIso: marks.dayEnd,
          });
        }
      }

      let plannedActual = 0;
      let unplannedActual = 0;
      if (conf) {
        for (const l of conf.lines) {
          if (l.allocationId != null && String(l.allocationId).trim() !== "") {
            if (!activeAllocIds.has(String(l.allocationId).trim())) continue;
          }
          if (l.kind === "unplanned") unplannedActual += l.actualHours;
          else plannedActual += l.actualHours;
        }
      }
      const totalActual = plannedActual + unplannedActual;
      const focusHours = focusMs > 0 ? hoursFromMs(focusMs) : undefined;
      const focusPct =
        focusHours != null && plannedActual > 0
          ? Math.round((focusHours / plannedActual) * 100)
          : undefined;
      const unplannedPct =
        totalActual > 0 ? Math.round((unplannedActual / totalActual) * 100) : undefined;

      const working = isWorkingWeekday(d, workingDays);
      const hasSignal =
        Boolean(marks.dayStart || marks.lunchOut || marks.lunchIn || marks.dayEnd) ||
        allotted > 0 ||
        Boolean(conf) ||
        focusMs > 0;

      rows.push({
        id: `ws-${emp.id}-${d}`,
        workDate: d,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        resourceOwnerId: emp.resourceOwnerId ?? "",
        resourceOwnerName: emp.resourceOwnerId ? (nameById.get(emp.resourceOwnerId) ?? "—") : "—",
        dayStart: marks.dayStart,
        lunchStart: marks.lunchOut,
        lunchEnd: marks.lunchIn,
        dayEnd: marks.dayEnd,
        officeMs: hasTimes ? officeMs : undefined,
        productiveMs: hasTimes ? productiveMs : undefined,
        allottedHours: allotted > 0 ? allotted : undefined,
        focusHours,
        actualHours: conf ? totalActual : undefined,
        plannedActualHours: conf ? plannedActual : undefined,
        unplannedActualHours: conf ? unplannedActual : undefined,
        focusPct,
        unplannedPct,
        compliance: workdayComplianceCode(conf, d, today, working),
        hasSignal,
      });
    }
  }

  return rows.sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.employeeName.localeCompare(b.employeeName)
  );
}
