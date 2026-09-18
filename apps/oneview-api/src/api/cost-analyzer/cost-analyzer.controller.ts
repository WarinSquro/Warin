import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { descendantEmployeeIds } from "../auth/resource-owner-tree";
import { RequirePermissions } from "../auth/guards";
import { CostAnalyzerService } from "./cost-analyzer.service";
import {
  last12WeekStarts,
  previousComparableRange,
  resolveCostPeriodRange,
  round2,
  type CostAnalyzerPeriodId,
} from "./cost-analyzer.periods";

function ser<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
  ) as T;
}

const PERIOD_IDS: CostAnalyzerPeriodId[] = [
  "this_week",
  "prev_week",
  "this_month",
  "prev_month",
  "custom",
];

@ApiTags("cost-analyzer")
@ApiBearerAuth()
@Controller("cost-analyzer")
export class CostAnalyzerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyzer: CostAnalyzerService
  ) {}

  private async scopedEmployeeIds(actorId: bigint, isSuperAdmin: boolean): Promise<bigint[]> {
    const all = await this.prisma.employee.findMany({
      where: { isDeleted: false, isSuperAdmin: false },
      select: { id: true, resourceOwnerId: true },
    });
    const rows = all.map((e) => ({
      id: e.id.toString(),
      resourceOwnerId: e.resourceOwnerId?.toString() ?? null,
    }));
    if (isSuperAdmin) return all.map((e) => e.id);
    const subs = descendantEmployeeIds(actorId.toString(), rows).map((id) => BigInt(id));
    return [actorId, ...subs];
  }

  private parsePeriod(period?: string, weeks?: string): {
    periodId: CostAnalyzerPeriodId;
    customWeeks: string[];
    current: { from: string; to: string };
    previous: { from: string; to: string };
  } {
    const periodId = (PERIOD_IDS.includes(period as CostAnalyzerPeriodId)
      ? period
      : "this_week") as CostAnalyzerPeriodId;
    const customWeeks = (weeks ?? "")
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    if (periodId === "custom" && customWeeks.length === 0) {
      throw new BadRequestException("Custom weeks require at least one week");
    }
    try {
      const current = resolveCostPeriodRange(periodId, { customWeeks });
      const previous = previousComparableRange(periodId, current, { customWeeks });
      return { periodId, customWeeks, current, previous };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : "Invalid period");
    }
  }

  /**
   * null = all departments; [] = none selected; otherwise IN-filter ids.
   * Accepts `departmentIds` (comma-separated) and legacy single `departmentId`.
   */
  private parseDepartmentFilter(departmentIds?: string, departmentId?: string): bigint[] | null {
    const multi = departmentIds?.trim();
    if (multi != null && multi !== "") {
      if (multi === "all") return null;
      if (multi === "none") return [];
      const ids = multi
        .split(",")
        .map((s) => s.trim())
        .filter((p) => /^\d+$/.test(p))
        .map((p) => BigInt(p));
      return ids;
    }
    if (departmentId && departmentId !== "all" && /^\d+$/.test(departmentId)) {
      return [BigInt(departmentId)];
    }
    return null;
  }

  @Get()
  @RequirePermissions("my_workspace.cost_analyzer")
  async card(
    @Req() req: { user: JwtPayload },
    @Query("period") period?: string,
    @Query("weeks") weeks?: string,
    @Query("departmentId") departmentId?: string,
    @Query("departmentIds") departmentIds?: string
  ) {
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");

    const { periodId, customWeeks, current, previous } = this.parsePeriod(period, weeks);
    const deptFilter = this.parseDepartmentFilter(departmentIds, departmentId);
    const singleDept =
      deptFilter != null && deptFilter.length === 1 ? deptFilter[0] : null;

    const scopeIds = await this.scopedEmployeeIds(actor.id, Boolean(req.user.isSuperAdmin));
    const cur = await this.analyzer.analyze({
      employeeIds: scopeIds,
      range: current,
      departmentIds: deptFilter,
    });
    const prev = await this.analyzer.analyze({
      employeeIds: scopeIds,
      range: previous,
      departmentIds: deptFilter,
    });

    const kpi = this.analyzer.buildKpi(cur.totals, prev.totals);
    const captured = cur.totals.capturedCost;
    const projectShare =
      captured > 0 ? round2((cur.totals.projectCost / captured) * 100) : null;
    const unplannedShare =
      captured > 0 ? round2((cur.totals.unplannedCost / captured) * 100) : null;

    const departmentsForChart = singleDept != null ? null : cur.departments;

    return ser({
      period: {
        id: periodId,
        from: current.from,
        to: current.to,
        previousFrom: previous.from,
        previousTo: previous.to,
        customWeeks: periodId === "custom" ? customWeeks : [],
        availableWeeks: last12WeekStarts().map((monday) => ({
          monday,
          label: monday,
        })),
      },
      departmentId: singleDept?.toString() ?? null,
      departmentIds: deptFilter?.map((id) => id.toString()) ?? null,
      kpi,
      composition: {
        projectCost: cur.totals.projectCost,
        unplannedCost: cur.totals.unplannedCost,
        projectPct: projectShare,
        unplannedPct: unplannedShare,
      },
      departmentMode: singleDept != null ? "project_vs_unplanned" : "departments",
      departments: departmentsForChart,
      selectedDepartmentSplit:
        singleDept != null
          ? {
              projectCost: cur.totals.projectCost,
              unplannedCost: cur.totals.unplannedCost,
              projectPct: projectShare,
              unplannedPct: unplannedShare,
            }
          : null,
      projects: cur.projects,
      unplannedReasons: cur.unplannedReasons,
      unplannedEmployees: cur.unplannedEmployees,
      attention: cur.attention,
      workingCalendar: {
        workingDays: cur.settings.workingDays,
        workingHoursPerDay: cur.settings.workingHoursPerDay,
      },
    });
  }

  @Get("lost-drilldown")
  @RequirePermissions("my_workspace.cost_analyzer")
  async lostDrilldown(
    @Req() req: { user: JwtPayload },
    @Query("period") period?: string,
    @Query("weeks") weeks?: string,
    @Query("departmentId") departmentId?: string,
    @Query("departmentIds") departmentIds?: string
  ) {
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");
    const { current } = this.parsePeriod(period, weeks);
    const deptFilter = this.parseDepartmentFilter(departmentIds, departmentId);
    const scopeIds = await this.scopedEmployeeIds(actor.id, Boolean(req.user.isSuperAdmin));
    const cur = await this.analyzer.analyze({
      employeeIds: scopeIds,
      range: current,
      departmentIds: deptFilter,
    });
    const rows = cur.empRows
      .filter((r) => r.lostCost > 0)
      .sort((a, b) => b.lostCost - a.lostCost)
      .map((r) => ({
        employee: r.name,
        hrmsId: r.hrmsId,
        department: r.departmentName,
        totalCtc: r.totalCtc,
        capturedCost: r.capturedCost,
        lostCost: r.lostCost,
        capturePct: r.capturePct,
        eligibleHours: r.eligibleHours,
        projectHours: r.projectHours,
        unplannedHours: r.unplannedHours,
        capturedHours: r.capturedHours,
        lostHours: r.lostHours,
      }));
    return ser({ weekStart: current.from, weekEnd: current.to, rows });
  }

  @Get("over-captured-drilldown")
  @RequirePermissions("my_workspace.cost_analyzer")
  async overCapturedDrilldown(
    @Req() req: { user: JwtPayload },
    @Query("period") period?: string,
    @Query("weeks") weeks?: string,
    @Query("departmentId") departmentId?: string,
    @Query("departmentIds") departmentIds?: string
  ) {
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");
    const { current } = this.parsePeriod(period, weeks);
    const deptFilter = this.parseDepartmentFilter(departmentIds, departmentId);
    const scopeIds = await this.scopedEmployeeIds(actor.id, Boolean(req.user.isSuperAdmin));
    const cur = await this.analyzer.analyze({
      employeeIds: scopeIds,
      range: current,
      departmentIds: deptFilter,
    });
    const rows = cur.empRows
      .filter((r) => r.overCapturedCost > 0 || r.overCapturedHours > 0)
      .sort((a, b) => b.overCapturedCost - a.overCapturedCost)
      .map((r) => ({
        employee: r.name,
        hrmsId: r.hrmsId,
        department: r.departmentName,
        eligibleHours: r.eligibleHours,
        projectHours: r.projectHours,
        unplannedHours: r.unplannedHours,
        capturedHours: r.capturedHours,
        overCapturedHours: r.overCapturedHours,
        totalCtc: r.totalCtc,
        capturedCost: r.capturedCost,
        overCapturedCost: r.overCapturedCost,
      }));
    return ser({ weekStart: current.from, weekEnd: current.to, rows });
  }

  @Get("project-drilldown")
  @RequirePermissions("my_workspace.cost_analyzer")
  async projectDrilldown(
    @Req() req: { user: JwtPayload },
    @Query("period") period?: string,
    @Query("weeks") weeks?: string,
    @Query("departmentId") departmentId?: string,
    @Query("departmentIds") departmentIds?: string,
    @Query("projectId") projectId?: string
  ) {
    if (!projectId?.trim()) throw new BadRequestException("projectId is required");
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");
    const { current } = this.parsePeriod(period, weeks);
    const deptFilter = this.parseDepartmentFilter(departmentIds, departmentId);
    const scopeIds = await this.scopedEmployeeIds(actor.id, Boolean(req.user.isSuperAdmin));
    const cur = await this.analyzer.analyze({
      employeeIds: scopeIds,
      range: current,
      departmentIds: deptFilter,
    });
    const project = cur.projects.find((p) => p.projectId === projectId);
    if (!project) throw new BadRequestException("Project not found in period");

    const byEmp = new Map(cur.employees.map((e) => [e.id.toString(), e]));
    const empMap = new Map<
      string,
      { name: string; department: string | null; hours: number; cost: number }
    >();
    for (const line of cur.lines) {
      if (line.kind === "unplanned") continue;
      const key = line.projectId?.toString() ?? `label:${line.projectName ?? "Unknown"}`;
      if (key !== projectId) continue;
      const emp = byEmp.get(line.employeeId.toString());
      if (!emp) continue;
      const rate = emp.rates
        .filter((r) => r.effectiveFrom <= line.workDate)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      const costPerMinute = rate?.costPerMinute ?? 0;
      const cost = round2(line.actualHours * 60 * costPerMinute);
      const row = empMap.get(emp.id.toString()) ?? {
        name: emp.name,
        department: emp.departmentName,
        hours: 0,
        cost: 0,
      };
      row.hours += line.actualHours;
      row.cost += cost;
      empMap.set(emp.id.toString(), row);
    }
    const employees = [...empMap.values()]
      .map((e) => ({
        ...e,
        hours: Math.round(e.hours * 10) / 10,
        cost: round2(e.cost),
        pctOfProject: project.cost > 0 ? round2((e.cost / project.cost) * 100) : null,
      }))
      .sort((a, b) => b.cost - a.cost);

    return ser({
      period: current,
      project,
      departments: project.departments,
      employees,
    });
  }

  @Get("department-drilldown")
  @RequirePermissions("my_workspace.cost_analyzer")
  async departmentDrilldown(
    @Req() req: { user: JwtPayload },
    @Query("period") period?: string,
    @Query("weeks") weeks?: string,
    @Query("departmentId") departmentId?: string
  ) {
    if (!departmentId?.trim()) throw new BadRequestException("departmentId is required");
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");
    const { current } = this.parsePeriod(period, weeks);
    const deptId = departmentId === "none" ? null : BigInt(departmentId);
    const scopeIds = await this.scopedEmployeeIds(actor.id, Boolean(req.user.isSuperAdmin));
    const cur = await this.analyzer.analyze({
      employeeIds: scopeIds,
      range: current,
      departmentIds: deptId != null ? [deptId] : null,
    });
    return ser({
      period: current,
      departmentId: deptId?.toString() ?? null,
      departmentName:
        cur.empRows[0]?.departmentName ??
        cur.departments.find((d) => d.departmentId === (deptId?.toString() ?? null))?.name ??
        "Unassigned",
      projects: cur.projects,
      unplannedReasons: cur.unplannedReasons,
      employees: cur.empRows
        .filter((e) => e.capturedCost > 0 || e.unplannedCost > 0 || e.projectCost > 0)
        .map((e) => ({
          employee: e.name,
          department: e.departmentName,
          hours: e.capturedHours,
          cost: e.capturedCost,
          pct:
            cur.totals.capturedCost > 0
              ? round2((e.capturedCost / cur.totals.capturedCost) * 100)
              : null,
          capturePct: e.capturePct,
        }))
        .sort((a, b) => b.cost - a.cost),
    });
  }
}
