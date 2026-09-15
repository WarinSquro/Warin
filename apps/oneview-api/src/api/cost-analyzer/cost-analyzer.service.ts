import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  addDaysISO,
  eachEligibleWorkingDay,
  isoDate,
  pctChange,
  round1,
  round2,
  type DateRange,
} from "./cost-analyzer.periods";

type CostRate = { effectiveFrom: string; costPerMinute: number };

type EmpRow = {
  id: bigint;
  hrmsId: string;
  name: string;
  departmentId: bigint | null;
  departmentName: string | null;
  joiningDate: string | null;
  exitDate: string | null;
  rates: CostRate[];
};

type WorkLine = {
  employeeId: bigint;
  workDate: string;
  kind: "planned" | "deviation" | "unplanned";
  actualHours: number;
  projectId: bigint | null;
  projectName: string | null;
  projectStart: string | null;
  projectEnd: string | null;
  poNumber: string | null;
  reason: string;
};

export type EmpCostBreakdown = {
  employeeId: string;
  hrmsId: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  totalCtc: number;
  eligibleHours: number;
  projectCost: number;
  unplannedCost: number;
  projectHours: number;
  unplannedHours: number;
  capturedCost: number;
  capturedHours: number;
  lostCost: number;
  lostHours: number;
  overCapturedCost: number;
  overCapturedHours: number;
  capturePct: number | null;
};

export type AnalyzerTotals = {
  totalCtc: number;
  projectCost: number;
  unplannedCost: number;
  capturedCost: number;
  lostCost: number;
  overCapturedCost: number;
  overCapturedHours: number;
  overCapturedEmployeeCount: number;
  projectHours: number;
  unplannedHours: number;
  eligibleHours: number;
};

function rateOnDate(rates: CostRate[], day: string): number {
  let best: CostRate | null = null;
  for (const r of rates) {
    if (r.effectiveFrom <= day && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best?.costPerMinute ?? 0;
}

function money(hours: number, ratePerMin: number): number {
  return round2(hours * 60 * ratePerMin);
}

@Injectable()
export class CostAnalyzerService {
  constructor(private readonly prisma: PrismaService) {}

  async loadSettings(): Promise<{ workingDays: string[]; workingHoursPerDay: number }> {
    const s = await this.prisma.appSettings.findFirst({
      where: { code: "default", isDeleted: false },
      select: { workingDays: true, workingHoursPerDay: true },
    });
    return {
      workingDays: s?.workingDays?.length ? s.workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      workingHoursPerDay: s?.workingHoursPerDay && s.workingHoursPerDay > 0 ? s.workingHoursPerDay : 8,
    };
  }

  async loadEmployeesInScope(
    employeeIds: bigint[],
    departmentId?: bigint | null
  ): Promise<EmpRow[]> {
    if (!employeeIds.length) return [];
    const rows = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        isDeleted: false,
        ...(departmentId != null ? { departmentId } : {}),
      },
      select: {
        id: true,
        hrmsId: true,
        name: true,
        departmentId: true,
        joiningDate: true,
        exitDate: true,
        department: { select: { name: true } },
        employeeCosts: {
          where: { isDeleted: false, isActive: true, status: "active" },
          orderBy: { effectiveFrom: "asc" },
          select: { effectiveFrom: true, costPerMinute: true },
        },
      },
    });
    return rows.map((e) => ({
      id: e.id,
      hrmsId: e.hrmsId,
      name: e.name,
      departmentId: e.departmentId,
      departmentName: e.department?.name ?? null,
      joiningDate: e.joiningDate ? isoDate(e.joiningDate) : null,
      exitDate: e.exitDate ? isoDate(e.exitDate) : null,
      rates: e.employeeCosts.map((c) => ({
        effectiveFrom: isoDate(c.effectiveFrom),
        costPerMinute: Number(c.costPerMinute),
      })),
    }));
  }

  async loadWorkLines(employeeIds: bigint[], range: DateRange): Promise<WorkLine[]> {
    if (!employeeIds.length) return [];
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const confs = await this.prisma.workConfirmation.findMany({
      where: {
        isDeleted: false,
        employeeId: { in: employeeIds },
        workDate: { gte: from, lte: to },
      },
      select: {
        employeeId: true,
        workDate: true,
        lines: {
          select: {
            kind: true,
            actualHours: true,
            reason: true,
            projectLabel: true,
            allocation: {
              select: {
                projectId: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    startDate: true,
                    endDate: true,
                    poNumber: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const out: WorkLine[] = [];
    for (const c of confs) {
      const workDate = isoDate(c.workDate);
      for (const line of c.lines) {
        const proj = line.allocation?.project;
        out.push({
          employeeId: c.employeeId,
          workDate,
          kind: line.kind,
          actualHours: line.actualHours,
          projectId: proj?.id ?? null,
          projectName: proj?.name ?? (line.kind === "unplanned" ? null : line.projectLabel || null),
          projectStart: proj ? isoDate(proj.startDate) : null,
          projectEnd: proj ? isoDate(proj.endDate) : null,
          poNumber: proj?.poNumber ?? null,
          reason: line.reason || "Other",
        });
      }
    }
    return out;
  }

  computeEmployeeBreakdowns(
    employees: EmpRow[],
    lines: WorkLine[],
    range: DateRange,
    workingDays: string[],
    workingHoursPerDay: number
  ): EmpCostBreakdown[] {
    const linesByEmp = new Map<string, WorkLine[]>();
    for (const l of lines) {
      const k = l.employeeId.toString();
      const list = linesByEmp.get(k) ?? [];
      list.push(l);
      linesByEmp.set(k, list);
    }

    return employees.map((e) => {
      const eligibleDays = eachEligibleWorkingDay(
        range.from,
        range.to,
        workingDays,
        e.joiningDate,
        e.exitDate
      );
      let totalCtc = 0;
      for (const day of eligibleDays) {
        const rate = rateOnDate(e.rates, day);
        totalCtc += money(workingHoursPerDay, rate);
      }
      totalCtc = round2(totalCtc);
      const eligibleHours = round1(eligibleDays.length * workingHoursPerDay);

      let projectCost = 0;
      let unplannedCost = 0;
      let projectHours = 0;
      let unplannedHours = 0;
      for (const line of linesByEmp.get(e.id.toString()) ?? []) {
        const rate = rateOnDate(e.rates, line.workDate);
        const cost = money(line.actualHours, rate);
        if (line.kind === "unplanned") {
          unplannedCost += cost;
          unplannedHours += line.actualHours;
        } else {
          projectCost += cost;
          projectHours += line.actualHours;
        }
      }
      projectCost = round2(projectCost);
      unplannedCost = round2(unplannedCost);
      projectHours = round1(projectHours);
      unplannedHours = round1(unplannedHours);
      const capturedCost = round2(projectCost + unplannedCost);
      const capturedHours = round1(projectHours + unplannedHours);
      const lostCost = round2(Math.max(0, totalCtc - capturedCost));
      const overCapturedCost = round2(Math.max(0, capturedCost - totalCtc));
      const overCapturedHours = round1(Math.max(0, capturedHours - eligibleHours));
      const lostHours =
        totalCtc > 0 && eligibleHours > 0
          ? round1(lostCost / (totalCtc / eligibleHours))
          : round1(Math.max(0, eligibleHours - capturedHours));
      const capturePct = totalCtc > 0 ? round2((capturedCost / totalCtc) * 100) : null;

      return {
        employeeId: e.id.toString(),
        hrmsId: e.hrmsId,
        name: e.name,
        departmentId: e.departmentId?.toString() ?? null,
        departmentName: e.departmentName,
        totalCtc,
        eligibleHours,
        projectCost,
        unplannedCost,
        projectHours,
        unplannedHours,
        capturedCost,
        capturedHours,
        lostCost,
        lostHours,
        overCapturedCost,
        overCapturedHours,
        capturePct,
      };
    });
  }

  sumTotals(rows: EmpCostBreakdown[]): AnalyzerTotals {
    let totalCtc = 0;
    let projectCost = 0;
    let unplannedCost = 0;
    let overCapturedCost = 0;
    let overCapturedHours = 0;
    let overCapturedEmployeeCount = 0;
    let projectHours = 0;
    let unplannedHours = 0;
    let eligibleHours = 0;
    for (const r of rows) {
      totalCtc += r.totalCtc;
      projectCost += r.projectCost;
      unplannedCost += r.unplannedCost;
      projectHours += r.projectHours;
      unplannedHours += r.unplannedHours;
      eligibleHours += r.eligibleHours;
      if (r.overCapturedCost > 0 || r.overCapturedHours > 0) {
        overCapturedCost += r.overCapturedCost;
        overCapturedHours += r.overCapturedHours;
        overCapturedEmployeeCount += 1;
      }
    }
    totalCtc = round2(totalCtc);
    projectCost = round2(projectCost);
    unplannedCost = round2(unplannedCost);
    const capturedCost = round2(projectCost + unplannedCost);
    const lostCost = round2(Math.max(0, totalCtc - capturedCost));
    // Company-level over-capture (may differ from sum of employee-level)
    const companyOver = round2(Math.max(0, capturedCost - totalCtc));
    return {
      totalCtc,
      projectCost,
      unplannedCost,
      capturedCost,
      lostCost,
      overCapturedCost: companyOver > 0 ? companyOver : round2(overCapturedCost),
      overCapturedHours: round1(overCapturedHours),
      overCapturedEmployeeCount,
      projectHours: round1(projectHours),
      unplannedHours: round1(unplannedHours),
      eligibleHours: round1(eligibleHours),
    };
  }

  buildKpi(current: AnalyzerTotals, previous: AnalyzerTotals) {
    const card = (cur: number, prev: number, extra?: Record<string, number | null>) => ({
      amount: round2(cur),
      previousAmount: round2(prev),
      changePct: pctChange(cur, prev),
      direction: cur > prev + 0.005 ? "up" : cur < prev - 0.005 ? "down" : "same",
      ...extra,
    });
    const ofCtc = (n: number, ctc: number) => (ctc > 0 ? round2((n / ctc) * 100) : null);
    return {
      totalCtc: card(current.totalCtc, previous.totalCtc),
      capturedCost: {
        ...card(current.capturedCost, previous.capturedCost),
        pctOfCtc: ofCtc(current.capturedCost, current.totalCtc),
      },
      lostCost: {
        ...card(current.lostCost, previous.lostCost),
        pctOfCtc: ofCtc(current.lostCost, current.totalCtc),
      },
      projectCost: {
        ...card(current.projectCost, previous.projectCost),
        pctOfCtc: ofCtc(current.projectCost, current.totalCtc),
      },
      unplannedCost: {
        ...card(current.unplannedCost, previous.unplannedCost),
        pctOfCtc: ofCtc(current.unplannedCost, current.totalCtc),
      },
      overCaptured:
        current.overCapturedCost > 0 || current.overCapturedHours > 0
          ? {
              amount: current.overCapturedCost,
              hours: current.overCapturedHours,
              employeeCount: current.overCapturedEmployeeCount,
              previousAmount: previous.overCapturedCost,
              changePct: pctChange(current.overCapturedCost, previous.overCapturedCost),
            }
          : null,
    };
  }

  projectComposition(lines: WorkLine[], employees: EmpRow[], companyCaptured: number) {
    const byEmp = new Map(employees.map((e) => [e.id.toString(), e]));
    type Agg = {
      projectId: string;
      name: string;
      poNumber: string;
      startDate: string | null;
      endDate: string | null;
      cost: number;
      hours: number;
      outsideCost: number;
      outsideHours: number;
      dept: Map<string, { name: string; cost: number; hours: number }>;
    };
    const map = new Map<string, Agg>();
    for (const line of lines) {
      if (line.kind === "unplanned") continue;
      const emp = byEmp.get(line.employeeId.toString());
      if (!emp) continue;
      const rate = rateOnDate(emp.rates, line.workDate);
      const cost = money(line.actualHours, rate);
      const key = line.projectId?.toString() ?? `label:${line.projectName ?? "Unknown"}`;
      let row = map.get(key);
      if (!row) {
        row = {
          projectId: key,
          name: line.projectName ?? "Unknown project",
          poNumber: line.poNumber?.trim() || "—",
          startDate: line.projectStart,
          endDate: line.projectEnd,
          cost: 0,
          hours: 0,
          outsideCost: 0,
          outsideHours: 0,
          dept: new Map(),
        };
        map.set(key, row);
      }
      row.cost += cost;
      row.hours += line.actualHours;
      const outside =
        (line.projectStart && line.workDate < line.projectStart) ||
        (line.projectEnd && line.workDate > line.projectEnd);
      if (outside) {
        row.outsideCost += cost;
        row.outsideHours += line.actualHours;
      }
      const deptKey = emp.departmentId?.toString() ?? "none";
      const deptName = emp.departmentName ?? "Unassigned";
      const d = row.dept.get(deptKey) ?? { name: deptName, cost: 0, hours: 0 };
      d.cost += cost;
      d.hours += line.actualHours;
      row.dept.set(deptKey, d);
    }

    return [...map.values()]
      .filter((p) => p.cost > 0)
      .map((p) => {
        const cost = round2(p.cost);
        const departments = [...p.dept.entries()]
          .map(([id, d]) => ({
            departmentId: id === "none" ? null : id,
            name: d.name,
            cost: round2(d.cost),
            hours: round1(d.hours),
            pctOfProject: cost > 0 ? round2((d.cost / cost) * 100) : null,
          }))
          .sort((a, b) => b.cost - a.cost);
        return {
          projectId: p.projectId,
          name: p.name,
          poNumber: p.poNumber,
          startDate: p.startDate,
          endDate: p.endDate,
          cost,
          hours: round1(p.hours),
          companySharePct: companyCaptured > 0 ? round2((cost / companyCaptured) * 100) : null,
          outsidePeriodCost: round2(p.outsideCost),
          outsidePeriodHours: round1(p.outsideHours),
          departments,
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }

  unplannedByReason(lines: WorkLine[], employees: EmpRow[]) {
    const byEmp = new Map(employees.map((e) => [e.id.toString(), e]));
    type EmpAgg = {
      employeeId: string;
      name: string;
      department: string | null;
      cost: number;
      hours: number;
    };
    const map = new Map<
      string,
      { reason: string; cost: number; hours: number; employees: Map<string, EmpAgg> }
    >();
    for (const line of lines) {
      if (line.kind !== "unplanned") continue;
      const emp = byEmp.get(line.employeeId.toString());
      if (!emp) continue;
      const rate = rateOnDate(emp.rates, line.workDate);
      const cost = money(line.actualHours, rate);
      const reason = line.reason?.trim() || "Other";
      const mutable = map.get(reason) ?? {
        reason,
        cost: 0,
        hours: 0,
        employees: new Map<string, EmpAgg>(),
      };
      mutable.cost += cost;
      mutable.hours += line.actualHours;
      const ek = emp.id.toString();
      const er = mutable.employees.get(ek) ?? {
        employeeId: ek,
        name: emp.name,
        department: emp.departmentName,
        cost: 0,
        hours: 0,
      };
      er.cost += cost;
      er.hours += line.actualHours;
      mutable.employees.set(ek, er);
      map.set(reason, mutable);
    }
    const rows = [...map.values()].map((r) => {
      const cost = round2(r.cost);
      const emps = [...r.employees.values()]
        .map((e) => ({
          employeeId: e.employeeId,
          name: e.name,
          department: e.department,
          cost: round2(e.cost),
          hours: round1(e.hours),
          pctShare: cost > 0 ? round2((e.cost / cost) * 100) : null,
        }))
        .sort((a, b) => b.cost - a.cost);
      return {
        reason: r.reason,
        cost,
        hours: round1(r.hours),
        employees: emps,
      };
    });
    const total = rows.reduce((s, r) => s + r.cost, 0);
    return rows
      .map((r) => ({
        ...r,
        pctShare: total > 0 ? round2((r.cost / total) * 100) : null,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  unplannedByEmployee(lines: WorkLine[], employees: EmpRow[]) {
    const byEmp = new Map(employees.map((e) => [e.id.toString(), e]));
    type ReasonAgg = { reason: string; cost: number; hours: number };
    const map = new Map<
      string,
      {
        employeeId: string;
        name: string;
        department: string | null;
        cost: number;
        hours: number;
        reasons: Map<string, ReasonAgg>;
      }
    >();
    for (const line of lines) {
      if (line.kind !== "unplanned") continue;
      const emp = byEmp.get(line.employeeId.toString());
      if (!emp) continue;
      const rate = rateOnDate(emp.rates, line.workDate);
      const cost = money(line.actualHours, rate);
      const reason = line.reason?.trim() || "Other";
      const ek = emp.id.toString();
      const mutable = map.get(ek) ?? {
        employeeId: ek,
        name: emp.name,
        department: emp.departmentName,
        cost: 0,
        hours: 0,
        reasons: new Map<string, ReasonAgg>(),
      };
      mutable.cost += cost;
      mutable.hours += line.actualHours;
      const rr = mutable.reasons.get(reason) ?? { reason, cost: 0, hours: 0 };
      rr.cost += cost;
      rr.hours += line.actualHours;
      mutable.reasons.set(reason, rr);
      map.set(ek, mutable);
    }
    const rows = [...map.values()].map((r) => {
      const cost = round2(r.cost);
      const reasons = [...r.reasons.values()]
        .map((x) => ({
          reason: x.reason,
          cost: round2(x.cost),
          hours: round1(x.hours),
          pctShare: cost > 0 ? round2((x.cost / cost) * 100) : null,
        }))
        .sort((a, b) => b.cost - a.cost);
      return {
        employeeId: r.employeeId,
        name: r.name,
        department: r.department,
        cost,
        hours: round1(r.hours),
        reasons,
      };
    });
    const total = rows.reduce((s, r) => s + r.cost, 0);
    return rows
      .map((r) => ({
        ...r,
        pctShare: total > 0 ? round2((r.cost / total) * 100) : null,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  departmentCaptured(rows: EmpCostBreakdown[], companyCaptured: number) {
    const map = new Map<string, { name: string; cost: number }>();
    for (const r of rows) {
      const key = r.departmentId ?? "none";
      const name = r.departmentName ?? "Unassigned";
      const cur = map.get(key) ?? { name, cost: 0 };
      cur.cost += r.capturedCost;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({
        departmentId: id === "none" ? null : id,
        name: v.name,
        cost: round2(v.cost),
        pctShare: companyCaptured > 0 ? round2((v.cost / companyCaptured) * 100) : null,
      }))
      .filter((d) => d.cost > 0)
      .sort((a, b) => b.cost - a.cost);
  }

  managementAttention(opts: {
    projects: ReturnType<CostAnalyzerService["projectComposition"]>;
    unplannedReasons: ReturnType<CostAnalyzerService["unplannedByReason"]>;
    empRows: EmpCostBreakdown[];
    departments: ReturnType<CostAnalyzerService["departmentCaptured"]>;
  }) {
    const items: Array<{
      type: string;
      entityName: string;
      amount: number;
      hours?: number;
      pct?: number | null;
      reason: string;
      link: { kind: string; id: string };
    }> = [];

    for (const p of opts.projects.slice(0, 5)) {
      items.push({
        type: "Top Cost Project",
        entityName: p.name,
        amount: p.cost,
        hours: p.hours,
        pct: p.companySharePct,
        reason: "Highest share of Captured Cost",
        link: { kind: "project", id: p.projectId },
      });
    }
    for (const r of opts.unplannedReasons.slice(0, 5)) {
      items.push({
        type: "High Unplanned",
        entityName: r.reason,
        amount: r.cost,
        hours: r.hours,
        pct: r.pctShare,
        reason: "Top unplanned reason by cost",
        link: { kind: "unplanned", id: r.reason },
      });
    }
    const byLost = [...opts.empRows].sort((a, b) => b.lostCost - a.lostCost).slice(0, 5);
    for (const e of byLost) {
      if (e.lostCost <= 0) continue;
      items.push({
        type: "High Lost Cost",
        entityName: e.name,
        amount: e.lostCost,
        pct: e.capturePct != null ? round2(100 - e.capturePct) : null,
        reason: "Low capture % / high lost cost",
        link: { kind: "employee", id: e.employeeId },
      });
    }
    for (const p of opts.projects.filter((x) => x.outsidePeriodCost > 0).slice(0, 5)) {
      items.push({
        type: "Outside Project Period",
        entityName: p.name,
        amount: p.outsidePeriodCost,
        hours: p.outsidePeriodHours,
        pct: p.cost > 0 ? round2((p.outsidePeriodCost / p.cost) * 100) : null,
        reason: "Work posted outside project dates",
        link: { kind: "project", id: p.projectId },
      });
    }
    for (const e of opts.empRows.filter((x) => x.overCapturedHours > 0).slice(0, 5)) {
      items.push({
        type: "Over-Captured Work",
        entityName: e.name,
        amount: e.overCapturedCost,
        hours: e.overCapturedHours,
        reason: "Captured hours exceed eligible hours",
        link: { kind: "over_captured", id: e.employeeId },
      });
    }
    return items;
  }

  async analyze(opts: {
    employeeIds: bigint[];
    range: DateRange;
    departmentId?: bigint | null;
  }) {
    const settings = await this.loadSettings();
    const employees = await this.loadEmployeesInScope(opts.employeeIds, opts.departmentId);
    const ids = employees.map((e) => e.id);
    const lines = await this.loadWorkLines(ids, opts.range);
    const empRows = this.computeEmployeeBreakdowns(
      employees,
      lines,
      opts.range,
      settings.workingDays,
      settings.workingHoursPerDay
    );
    const totals = this.sumTotals(empRows);
    const projects = this.projectComposition(lines, employees, totals.capturedCost);
    const unplannedReasons = this.unplannedByReason(lines, employees);
    const unplannedEmployees = this.unplannedByEmployee(lines, employees);
    const departments = this.departmentCaptured(empRows, totals.capturedCost);
    return {
      settings,
      employees,
      lines,
      empRows,
      totals,
      projects,
      unplannedReasons,
      unplannedEmployees,
      departments,
      attention: this.managementAttention({
        projects,
        unplannedReasons,
        empRows,
        departments,
      }),
    };
  }
}

export type { WorkLine, EmpRow };
