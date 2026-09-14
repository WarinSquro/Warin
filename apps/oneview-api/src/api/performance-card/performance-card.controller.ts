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
import {
  addDaysISO,
  compareArrow,
  invertPctForRank,
  isoDate,
  last12WeekStarts,
  lastCompletedQuarter,
  pickStrengthsAndNeeds,
  previousComparableRange,
  resolvePeriodRange,
  resolveTrendChip,
  round0,
  round1,
  scoreOutOf5ToRankPct,
  threePeriodBasis,
  type DateRange,
  type MetricDirection,
  type PerfCardPeriodId,
  type RankableMetric,
  type TrendStatus,
} from "./performance-card.periods";

function ser<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
  ) as T;
}

const PERIOD_IDS: PerfCardPeriodId[] = [
  "this_week",
  "prev_week",
  "this_month",
  "prev_month",
  "this_quarter",
  "prev_quarter",
  "custom",
];

/** Work Confirmation → Unplanned work reasons (keep in sync with `data/confirmation.ts`). */
const UNPLANNED_WORK_REASONS = [
  "No Allocated Work",
  "Client / External Request",
  "Internal Meeting / Discussion",
  "Production / Critical Issue",
  "Urgent Internal Work",
] as const;

type PeriodMetrics = {
  plannedHrs: number | null;
  actualHrs: number | null;
  billableHrs: number | null;
  focusHrs: number | null;
  focusPct: number | null;
  avgLapDurationMin: number | null;
  unplannedHrs: number | null;
  unplannedPct: number | null;
  planningAccuracy: number | null;
  confirmationDiscipline: number | null;
  billableSplitPct: number | null;
  negativeLeaves: number | null;
  appreciation: number | null;
  publicAppreciation: number | null;
  behaviouralAvg: number | null;
  technicalAvg: number | null;
};

type CompetencyRow = {
  id: string;
  code: string;
  name: string;
  score: number | null;
  kind: "behavioural" | "technical";
  remark: string;
  sequence: number;
};

@ApiTags("performance-card")
@ApiBearerAuth()
@Controller("performance-card")
export class PerformanceCardController {
  constructor(private readonly prisma: PrismaService) {}

  private async reportSubtreeIds(ownerId: bigint): Promise<bigint[]> {
    const rows = await this.prisma.employee.findMany({
      where: { isDeleted: false },
      select: { id: true, resourceOwnerId: true },
    });
    const ids = descendantEmployeeIds(
      ownerId.toString(),
      rows.map((r) => ({
        id: r.id.toString(),
        resourceOwnerId: r.resourceOwnerId?.toString() ?? null,
      }))
    );
    return ids.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
  }

  private async assertCanView(
    actor: { id: bigint; isSuperAdmin: boolean },
    targetId: bigint
  ): Promise<void> {
    if (actor.isSuperAdmin || actor.id === targetId) return;
    const reports = await this.reportSubtreeIds(actor.id);
    if (!reports.some((id) => id === targetId)) {
      throw new ForbiddenException("Not allowed to view this Performance Card");
    }
  }

  @Get("resources")
  @RequirePermissions("my_workspace.performance_card")
  async resources(@Req() req: { user: JwtPayload }) {
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");

    // SuperAdmin / platform Administrator has no personal Performance Card — pick a real employee.
    if (req.user.isSuperAdmin || actor.isSuperAdmin) {
      const all = await this.prisma.employee.findMany({
        where: { isDeleted: false, isActive: true, status: "active", isSuperAdmin: false },
        select: { id: true, hrmsId: true, name: true },
        orderBy: { name: "asc" },
      });
      return ser({
        resources: all.map((e) => ({
          employeeId: e.id.toString(),
          hrmsId: e.hrmsId,
          name: e.name,
          relation: "indirect" as const,
        })),
      });
    }

    const self = {
      employeeId: actor.id.toString(),
      hrmsId: actor.hrmsId,
      name: actor.name,
      relation: "self" as const,
    };

    const reportIds = await this.reportSubtreeIds(actor.id);
    if (reportIds.length === 0) return ser({ resources: [self] });

    const reports = await this.prisma.employee.findMany({
      where: {
        id: { in: reportIds },
        isDeleted: false,
        isActive: true,
        status: "active",
        isSuperAdmin: false,
      },
      select: { id: true, hrmsId: true, name: true, resourceOwnerId: true },
      orderBy: { name: "asc" },
    });

    return ser({
      resources: [
        self,
        ...reports.map((e) => ({
          employeeId: e.id.toString(),
          hrmsId: e.hrmsId,
          name: e.name,
          relation: e.resourceOwnerId === actor.id ? ("direct" as const) : ("indirect" as const),
        })),
      ],
    });
  }

  /**
   * Hidden Administrator diagnostic: focus laps for one employee week
   * (powers MetricHistoryModal Shift+click). Super-admin only.
   */
  @Get("focus-laps")
  @RequirePermissions("my_workspace.performance_card")
  async focusLaps(
    @Req() req: { user: JwtPayload },
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("weekStart") weekStart?: string
  ) {
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException("Administrator only");
    }
    const hrms = (employeeHrmsId ?? "").trim();
    const monday = (weekStart ?? "").trim();
    if (!hrms) throw new BadRequestException("employeeHrmsId is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
      throw new BadRequestException("weekStart must be YYYY-MM-DD (Monday)");
    }
    const sunday = addDaysISO(monday, 6);

    const target = await this.prisma.employee.findFirst({
      where: { hrmsId: hrms, isDeleted: false },
      select: { id: true, hrmsId: true, name: true },
    });
    if (!target) throw new BadRequestException("Employee not found");

    const from = new Date(`${monday}T00:00:00.000Z`);
    const to = new Date(`${sunday}T00:00:00.000Z`);

    const laps = await this.prisma.confirmationFocusLap.findMany({
      where: {
        day: {
          employeeId: target.id,
          isDeleted: false,
          workDate: { gte: from, lte: to },
        },
      },
      orderBy: [{ day: { workDate: "asc" } }, { startedAt: "asc" }],
      select: {
        startedAt: true,
        endedAt: true,
        durationMs: true,
        day: { select: { workDate: true } },
      },
    });

    const rows = laps.map((l) => {
      const durationMs = Math.max(0, Math.floor(Number(l.durationMs) || 0));
      return {
        workDate: isoDate(l.day.workDate),
        startedAt: l.startedAt.toISOString(),
        endedAt: l.endedAt.toISOString(),
        durationMs,
        durationMin: round1(durationMs / 60_000),
      };
    });

    const sumMs = rows.reduce((s, r) => s + r.durationMs, 0);
    const avgMin = rows.length > 0 ? round1(sumMs / rows.length / 60_000) : null;

    return ser({
      employee: { hrmsId: target.hrmsId, name: target.name },
      weekStart: monday,
      weekEnd: sunday,
      lapCount: rows.length,
      avgDurationMin: avgMin,
      sumDurationMs: sumMs,
      sumDurationMin: round1(sumMs / 60_000),
      resultColumn: "duration_min",
      resultValue: avgMin,
      calculation:
        rows.length > 0 && avgMin != null
          ? `avg_lap_min = sum(duration_ms) / lap_count / 60000 = ${sumMs} / ${rows.length} / 60000 = ${avgMin}`
          : null,
      rows,
    });
  }

  /**
   * Hidden Administrator diagnostic: underlying rows for a metric week bar.
   * Super-admin only. Average Lap Duration continues to use GET focus-laps.
   */
  @Get("metric-debug")
  @RequirePermissions("my_workspace.performance_card")
  async metricDebug(
    @Req() req: { user: JwtPayload },
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("weekStart") weekStart?: string,
    @Query("metricId") metricId?: string
  ) {
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException("Administrator only");
    }
    const hrms = (employeeHrmsId ?? "").trim();
    const monday = (weekStart ?? "").trim();
    const metric = (metricId ?? "").trim();
    if (!hrms) throw new BadRequestException("employeeHrmsId is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
      throw new BadRequestException("weekStart must be YYYY-MM-DD (Monday)");
    }
    const allowed = new Set([
      "plannedHrs",
      "actualHrs",
      "billableHrs",
      "unplannedHrs",
      "unplannedPct",
      "billableSplitPct",
      "planningAccuracy",
      "focusHrs",
      "focusPct",
      "confirmationDiscipline",
    ]);
    if (!allowed.has(metric)) {
      throw new BadRequestException(`Unsupported metricId: ${metric || "(empty)"}`);
    }

    const sunday = addDaysISO(monday, 6);
    const target = await this.prisma.employee.findFirst({
      where: { hrmsId: hrms, isDeleted: false },
      select: { id: true, hrmsId: true, name: true },
    });
    if (!target) throw new BadRequestException("Employee not found");

    const from = new Date(`${monday}T00:00:00.000Z`);
    const to = new Date(`${sunday}T00:00:00.000Z`);

    const employee = { hrmsId: target.hrmsId, name: target.name };
    const base = { metricId: metric, employee, weekStart: monday, weekEnd: sunday };

    if (
      metric === "plannedHrs" ||
      metric === "actualHrs" ||
      metric === "billableHrs" ||
      metric === "unplannedHrs" ||
      metric === "unplannedPct" ||
      metric === "billableSplitPct" ||
      metric === "planningAccuracy"
    ) {
      return ser(await this.debugConfirmationLines(target.id, from, to, metric, base));
    }
    if (metric === "focusHrs" || metric === "focusPct") {
      return ser(await this.debugFocusSessions(target.id, from, to, metric, base));
    }
    return ser(await this.debugConfirmationDiscipline(target.id, monday, sunday, base));
  }

  private async debugConfirmationLines(
    employeeId: bigint,
    from: Date,
    to: Date,
    metric: string,
    base: {
      metricId: string;
      employee: { hrmsId: string; name: string };
      weekStart: string;
      weekEnd: string;
    }
  ) {
    const confirmations = await this.prisma.workConfirmation.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      include: {
        lines: {
          include: {
            allocation: {
              include: {
                activity: { select: { billable: true, name: true } },
                project: { select: { name: true, projectCode: true } },
              },
            },
          },
        },
      },
      orderBy: { workDate: "asc" },
    });

    type LineOut = {
      work_date: string;
      kind: string;
      project: string;
      activity: string;
      reason: string;
      planned_hours: number;
      actual_hours: number;
      billable: boolean | null;
    };

    const all: LineOut[] = [];
    for (const c of confirmations) {
      const workDate = isoDate(c.workDate);
      for (const line of c.lines) {
        const project =
          line.allocation?.project?.name?.trim() ||
          line.allocation?.project?.projectCode ||
          line.projectLabel ||
          "—";
        const activity = line.allocation?.activity?.name || line.activity || "—";
        let billable: boolean | null = null;
        if (line.kind === "unplanned") {
          billable = false;
        } else if (line.allocation?.activity?.billable === true) {
          billable = true;
        } else if (line.allocation?.activity?.billable === false) {
          billable = false;
        } else if (!line.allocation) {
          billable = true; // orphan planned/deviation — matches computePeriodMetrics
        }
        all.push({
          work_date: workDate,
          kind: line.kind,
          project,
          activity,
          reason: line.reason || "",
          planned_hours: round1(line.plannedHours),
          actual_hours: round1(line.actualHours),
          billable,
        });
      }
    }

    let rows = all;
    if (metric === "unplannedHrs" || metric === "unplannedPct") {
      rows = all.filter((r) => r.kind === "unplanned");
    } else if (metric === "billableHrs" || metric === "billableSplitPct") {
      rows = all.filter((r) => r.billable === true);
    }

    const sumPlanned = round1(rows.reduce((s, r) => s + r.planned_hours, 0));
    const sumActual = round1(rows.reduce((s, r) => s + r.actual_hours, 0));
    const allPlanned = round1(all.reduce((s, r) => s + r.planned_hours, 0));
    const allActual = round1(all.reduce((s, r) => s + r.actual_hours, 0));
    const allBillable = round1(
      all.filter((r) => r.billable === true).reduce((s, r) => s + r.actual_hours, 0)
    );
    const allUnplanned = round1(
      all.filter((r) => r.kind === "unplanned").reduce((s, r) => s + r.actual_hours, 0)
    );

    const needsResultCol =
      metric === "unplannedPct" ||
      metric === "billableSplitPct" ||
      metric === "planningAccuracy";

    const columns =
      metric === "unplannedHrs" || metric === "unplannedPct"
        ? ["work_date", "kind", "project", "reason", "actual_hours", ...(needsResultCol ? ["metric_result"] : [])]
        : metric === "billableHrs" || metric === "billableSplitPct"
          ? [
              "work_date",
              "kind",
              "project",
              "activity",
              "billable",
              "actual_hours",
              ...(needsResultCol ? ["metric_result"] : []),
            ]
          : metric === "planningAccuracy"
            ? ["work_date", "kind", "project", "activity", "planned_hours", "actual_hours", "metric_result"]
            : ["work_date", "kind", "project", "activity", "planned_hours", "actual_hours"];

    let resultValue: number | string | null = null;
    let resultColumn: string | null = null;
    let calculation: string | null = null;

    if (metric === "plannedHrs") {
      resultColumn = "planned_hours";
      resultValue = sumPlanned;
      calculation = `planned_hrs = sum(planned_hours) = ${sumPlanned}`;
    } else if (metric === "actualHrs") {
      resultColumn = "actual_hours";
      resultValue = sumActual;
      calculation = `actual_hrs = sum(actual_hours) = ${sumActual}`;
    } else if (metric === "billableHrs") {
      resultColumn = "actual_hours";
      resultValue = sumActual;
      calculation = `billable_hrs = sum(actual_hours where billable) = ${sumActual}`;
    } else if (metric === "unplannedHrs") {
      resultColumn = "actual_hours";
      resultValue = sumActual;
      calculation = `unplanned_hrs = sum(actual_hours where kind=unplanned) = ${sumActual}`;
    } else if (metric === "planningAccuracy") {
      const pct =
        allPlanned > 0 ? round0((Math.min(allActual, allPlanned) / allPlanned) * 100) : null;
      resultColumn = "metric_result";
      resultValue = pct;
      calculation =
        pct == null
          ? "planning_accuracy = — (no planned hours)"
          : `planning_accuracy = min(actual, planned) / planned × 100 = min(${allActual}, ${allPlanned}) / ${allPlanned} × 100 = ${pct}%`;
    } else if (metric === "unplannedPct") {
      const pct = allActual > 0 ? round0((allUnplanned / allActual) * 100) : null;
      resultColumn = "metric_result";
      resultValue = pct;
      calculation =
        pct == null
          ? "unplanned_pct = — (no actual hours)"
          : `unplanned_pct = unplanned_hrs / actual_hrs × 100 = ${allUnplanned} / ${allActual} × 100 = ${pct}%`;
    } else if (metric === "billableSplitPct") {
      const pct = allActual > 0 ? round0((allBillable / allActual) * 100) : null;
      resultColumn = "metric_result";
      resultValue = pct;
      calculation =
        pct == null
          ? "billable_split_pct = — (no actual hours)"
          : `billable_split_pct = billable_hrs / actual_hrs × 100 = ${allBillable} / ${allActual} × 100 = ${pct}%`;
    }

    const totals: Record<string, string | number | boolean | null> = { work_date: "TOTAL" };
    for (const col of columns) {
      if (col === "work_date") continue;
      if (col === "planned_hours") totals[col] = allPlanned;
      else if (col === "actual_hours") {
        totals[col] =
          metric === "billableHrs" || metric === "billableSplitPct"
            ? allBillable
            : metric === "unplannedHrs" || metric === "unplannedPct"
              ? allUnplanned
              : allActual;
      } else if (col === "metric_result") {
        totals[col] =
          resultValue == null ? "—" : typeof resultValue === "number" ? `${resultValue}%` : resultValue;
      } else totals[col] = "";
    }

    return {
      ...base,
      title:
        metric === "plannedHrs"
          ? "Planned Hrs"
          : metric === "actualHrs"
            ? "Actual Hrs"
            : metric === "billableHrs"
              ? "Billable Hrs"
              : metric === "unplannedHrs"
                ? "Unplanned Hrs"
                : metric === "unplannedPct"
                  ? "Unplanned %"
                  : metric === "billableSplitPct"
                    ? "Billable Split %"
                    : "Planning Accuracy",
      columns,
      rows: rows.map((r) => {
        const out: Record<string, string | number | boolean | null> = {};
        for (const col of columns) {
          if (col === "metric_result") out[col] = "";
          else out[col] = (r as Record<string, string | number | boolean | null>)[col] ?? "";
        }
        return out;
      }),
      totals: rows.length || needsResultCol ? totals : null,
      resultColumn,
      resultValue,
      calculation,
      summary: calculation,
    };
  }

  private async debugFocusSessions(
    employeeId: bigint,
    from: Date,
    to: Date,
    metric: string,
    base: {
      metricId: string;
      employee: { hrmsId: string; name: string };
      weekStart: string;
      weekEnd: string;
    }
  ) {
    const prodDays = await this.prisma.confirmationProductivityDay.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      include: { focusSessions: true, focusLaps: true },
      orderBy: { workDate: "asc" },
    });

    // Match computePeriodMetrics: sessions first; if focusMs === 0, use lap total.
    let sessionFocusMs = 0;
    const sessionRows: Array<Record<string, string | number | boolean | null>> = [];
    let lapMs = 0;
    const lapRows: Array<Record<string, string | number | boolean | null>> = [];

    for (const day of prodDays) {
      const workDate = isoDate(day.workDate);
      for (const s of day.focusSessions) {
        const sessionAccumMs = Math.max(0, Math.floor(Number(s.sessionAccumMs) || 0));
        let openSegmentMs = 0;
        if (s.segmentStartedAt) {
          const end = day.dayEndAt ?? new Date(`${workDate}T18:00:00.000Z`);
          openSegmentMs = Math.max(0, end.getTime() - s.segmentStartedAt.getTime());
        }
        const focusMs = sessionAccumMs + openSegmentMs;
        sessionFocusMs += focusMs;
        sessionRows.push({
          work_date: workDate,
          source: "session",
          allocation_key: s.allocationKey,
          session_accum_ms: sessionAccumMs,
          open_segment_ms: openSegmentMs,
          focus_ms: focusMs,
          focus_hrs: round1(focusMs / 3_600_000),
        });
      }
      for (const lap of day.focusLaps) {
        const durationMs = Math.max(0, Math.floor(Number(lap.durationMs) || 0));
        lapMs += durationMs;
        lapRows.push({
          work_date: workDate,
          source: "lap",
          allocation_key: lap.allocationKey,
          session_accum_ms: "",
          open_segment_ms: "",
          focus_ms: durationMs,
          focus_hrs: round1(durationMs / 3_600_000),
        });
      }
    }

    const usedLapFallback = sessionFocusMs === 0 && lapMs > 0;
    const totalFocusMs = usedLapFallback ? lapMs : sessionFocusMs;
    const rows = usedLapFallback ? lapRows : sessionRows;
    const focusHrs = round1(totalFocusMs / 3_600_000);

    const columns = [
      "work_date",
      "source",
      "allocation_key",
      "session_accum_ms",
      "open_segment_ms",
      "focus_ms",
      "focus_hrs",
      ...(metric === "focusPct" ? ["metric_result"] : []),
    ];

    const confirmations = await this.prisma.workConfirmation.findMany({
      where: { employeeId, isDeleted: false, workDate: { gte: from, lte: to } },
      include: { lines: true },
    });
    let planned = 0;
    let actual = 0;
    for (const c of confirmations) {
      for (const line of c.lines) {
        planned += line.plannedHours;
        actual += line.actualHours;
      }
    }
    const denom = actual > 0 ? actual : planned > 0 ? planned : 0;
    const focusPct = denom > 0 ? round0((focusHrs / denom) * 100) : null;

    let resultColumn: string | null = metric === "focusPct" ? "metric_result" : "focus_hrs";
    let resultValue: number | string | null = metric === "focusPct" ? focusPct : focusHrs;
    let calculation: string | null =
      metric === "focusPct"
        ? focusPct == null
          ? "focus_pct = — (no planned/actual hours)"
          : `focus_pct = focus_hrs / ${actual > 0 ? "actual" : "planned"} × 100 = ${focusHrs} / ${round1(denom)} × 100 = ${focusPct}%${
              usedLapFallback ? " (focus from laps; sessions sum to 0)" : ""
            }`
        : `focus_hrs = sum(focus_ms) / 3600000 = ${totalFocusMs} / 3600000 = ${focusHrs}${
            usedLapFallback ? " (from laps; sessions sum to 0)" : ""
          }`;

    const totals: Record<string, string | number | boolean | null> = {
      work_date: "TOTAL",
      source: usedLapFallback ? "lap" : "session",
      allocation_key: "",
      session_accum_ms: usedLapFallback
        ? ""
        : rows.reduce((s, r) => s + Number(r.session_accum_ms || 0), 0),
      open_segment_ms: usedLapFallback
        ? ""
        : rows.reduce((s, r) => s + Number(r.open_segment_ms || 0), 0),
      focus_ms: totalFocusMs,
      focus_hrs: focusHrs,
    };
    if (metric === "focusPct") {
      totals.metric_result = focusPct == null ? "—" : `${focusPct}%`;
    }

    return {
      ...base,
      title: metric === "focusPct" ? "Focus %" : "Focus Hrs",
      columns,
      rows: rows.map((r) => {
        const out: Record<string, string | number | boolean | null> = { ...r };
        if (metric === "focusPct") out.metric_result = "";
        return out;
      }),
      totals: rows.length || totalFocusMs > 0 ? totals : null,
      resultColumn,
      resultValue,
      calculation,
      summary: calculation,
    };
  }

  private async debugConfirmationDiscipline(
    employeeId: bigint,
    monday: string,
    sunday: string,
    base: {
      metricId: string;
      employee: { hrmsId: string; name: string };
      weekStart: string;
      weekEnd: string;
    }
  ) {
    const settings = await this.prisma.appSettings.findFirst({
      where: { code: "default", isDeleted: false },
      select: { workingDays: true },
    });
    const workingDays = settings?.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const set = new Set(workingDays.length ? workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const from = new Date(`${monday}T00:00:00.000Z`);
    const to = new Date(`${sunday}T00:00:00.000Z`);
    const confirmations = await this.prisma.workConfirmation.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      select: {
        workDate: true,
        submittedAt: true,
        isMissedPosting: true,
      },
    });
    const byDate = new Map(
      confirmations.map((c) => [
        isoDate(c.workDate),
        { submittedAt: c.submittedAt.toISOString(), isMissedPosting: c.isMissedPosting },
      ])
    );

    // Match computePeriodMetrics: unique confirmation dates / workingDayCount
    const confirmedDays = new Set(confirmations.map((c) => isoDate(c.workDate))).size;
    const workingDayCount = countWorkingDays(monday, sunday, workingDays);

    const columns = [
      "work_date",
      "is_working_day",
      "confirmed",
      "submitted_at",
      "is_missed_posting",
      "metric_result",
    ];
    const rows: Array<Record<string, string | number | boolean | null>> = [];

    for (let d = monday; d <= sunday; d = addDaysISO(d, 1)) {
      const dt = new Date(`${d}T12:00:00`);
      const isWorking = set.has(labels[dt.getDay()]!);
      const conf = byDate.get(d);
      const confirmed = Boolean(conf);
      rows.push({
        work_date: d,
        is_working_day: isWorking,
        confirmed,
        submitted_at: conf?.submittedAt ?? "—",
        is_missed_posting: conf ? conf.isMissedPosting : null,
        metric_result: "",
      });
    }

    const pct =
      workingDayCount > 0 && confirmations.length > 0
        ? round0((confirmedDays / workingDayCount) * 100)
        : null;

    const calculation =
      pct == null
        ? workingDayCount > 0
          ? "confirmation_discipline = — (no confirmations in week)"
          : "confirmation_discipline = — (no working days in week)"
        : `confirmation_discipline = confirmed_days / working_days × 100 = ${confirmedDays} / ${workingDayCount} × 100 = ${pct}%`;

    const totals: Record<string, string | number | boolean | null> = {
      work_date: "TOTAL",
      is_working_day: workingDayCount,
      confirmed: confirmedDays,
      submitted_at: "",
      is_missed_posting: "",
      metric_result: pct == null ? "—" : `${pct}%`,
    };

    return {
      ...base,
      title: "Confirmation Discipline",
      columns,
      rows,
      totals,
      resultColumn: "metric_result",
      resultValue: pct,
      calculation,
      summary: calculation,
    };
  }

  @Get()
  @RequirePermissions("my_workspace.performance_card")
  async card(
    @Req() req: { user: JwtPayload },
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("period") period?: string,
    @Query("weeks") weeks?: string
  ) {
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");

    const periodId = (PERIOD_IDS.includes(period as PerfCardPeriodId)
      ? period
      : "this_week") as PerfCardPeriodId;
    const customWeeks = (weeks ?? "")
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);

    if (periodId === "custom" && customWeeks.length === 0) {
      throw new BadRequestException("Custom weeks require at least one week");
    }

    let current: DateRange;
    try {
      current = resolvePeriodRange(periodId, { customWeeks });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : "Invalid period");
    }

    const hrms = (employeeHrmsId?.trim() || actor.hrmsId).trim();
    const target = await this.prisma.employee.findFirst({
      where: { hrmsId: hrms, isDeleted: false },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!target) throw new BadRequestException("Employee not found");
    await this.assertCanView(
      { id: actor.id, isSuperAdmin: Boolean(req.user.isSuperAdmin) },
      target.id
    );

    const settings = await this.prisma.appSettings.findFirst({
      where: { code: "default", isDeleted: false },
      select: { workingDays: true },
    });
    const workingDays = settings?.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];

    const basis = threePeriodBasis(periodId, current, { customWeeks });
    const previous = previousComparableRange(periodId, current, { customWeeks });

    const [currentM, previousM, basisMetrics, competencies, contribution, unplanned, weekHistory, kpi] =
      await Promise.all([
        this.computePeriodMetrics(target.id, current, workingDays),
        this.computePeriodMetrics(target.id, previous, workingDays),
        Promise.all(basis.map((r) => this.computePeriodMetrics(target.id, r, workingDays))),
        this.computeCompetencies(target.id, target.departmentId, current),
        this.computeContribution(target.id, current),
        this.computeUnplannedByReason(target.id, current),
        this.computeWeekHistory(target.id, workingDays),
        this.computeLastQuarterKpis(target.id),
      ]);

    const trend = (key: keyof PeriodMetrics, dir: MetricDirection): TrendStatus =>
      resolveTrendChip(
        basisMetrics.map((m) => m[key] as number | null),
        currentM[key] as number | null,
        previousM[key] as number | null,
        dir
      );

    const arrow = (cur: number | null, prev: number | null, dir: MetricDirection) =>
      compareArrow(cur, prev, dir);

    const productivityRows = [
      metricRow("plannedHrs", "Planned Hrs", currentM.plannedHrs, previousM.plannedHrs, basisMetrics.map((m) => m.plannedHrs), "higher_better", (v) => `${v}h`),
      metricRow("actualHrs", "Actual Hrs", currentM.actualHrs, previousM.actualHrs, basisMetrics.map((m) => m.actualHrs), "higher_better", (v) => `${v}h`),
      metricRow("billableHrs", "Billable Hrs", currentM.billableHrs, previousM.billableHrs, basisMetrics.map((m) => m.billableHrs), "higher_better", (v) => `${v}h`),
      metricRow("focusHrs", "Focus Hrs", currentM.focusHrs, previousM.focusHrs, basisMetrics.map((m) => m.focusHrs), "higher_better", (v) => `${v}h`),
      metricRow("focusPct", "Focus %", currentM.focusPct, previousM.focusPct, basisMetrics.map((m) => m.focusPct), "higher_better", (v) => `${v}%`),
      metricRow("avgLapDurationMin", "Average Lap Duration", currentM.avgLapDurationMin, previousM.avgLapDurationMin, basisMetrics.map((m) => m.avgLapDurationMin), "higher_better", formatLap),
      metricRow("unplannedHrs", "Unplanned Hrs", currentM.unplannedHrs, previousM.unplannedHrs, basisMetrics.map((m) => m.unplannedHrs), "lower_better", (v) => `${v}h`),
      metricRow("planningAccuracy", "Planning Accuracy", currentM.planningAccuracy, previousM.planningAccuracy, basisMetrics.map((m) => m.planningAccuracy), "higher_better", (v) => `${v}%`),
      metricRow("confirmationDiscipline", "Confirmation Discipline", currentM.confirmationDiscipline, previousM.confirmationDiscipline, basisMetrics.map((m) => m.confirmationDiscipline), "higher_better", (v) => `${v}%`),
      {
        id: "negativeLeaves",
        label: "Negative Leaves",
        current: currentM.negativeLeaves,
        previous: previousM.negativeLeaves,
        currentDisplay: currentM.negativeLeaves == null ? "—" : String(currentM.negativeLeaves),
        previousDisplay: previousM.negativeLeaves == null ? "—" : String(previousM.negativeLeaves),
        trend: null as TrendStatus,
        arrow: null as "up" | "down" | "same" | null,
        countOnly: true,
        direction: "neutral" as MetricDirection,
      },
      {
        id: "publicAppreciation",
        label: "Public Appreciation",
        current: currentM.publicAppreciation,
        previous: previousM.publicAppreciation,
        currentDisplay: currentM.publicAppreciation == null ? "—" : String(currentM.publicAppreciation),
        previousDisplay: previousM.publicAppreciation == null ? "—" : String(previousM.publicAppreciation),
        trend: null as TrendStatus,
        arrow: null as "up" | "down" | "same" | null,
        countOnly: true,
        direction: "neutral" as MetricDirection,
      },
      {
        id: "appreciation",
        label: "Appreciation",
        current: currentM.appreciation,
        previous: previousM.appreciation,
        currentDisplay: currentM.appreciation == null ? "—" : String(currentM.appreciation),
        previousDisplay: previousM.appreciation == null ? "—" : String(previousM.appreciation),
        trend: null as TrendStatus,
        arrow: null as "up" | "down" | "same" | null,
        countOnly: true,
        direction: "neutral" as MetricDirection,
      },
    ];

    function metricRow(
      id: string,
      label: string,
      cur: number | null,
      prev: number | null,
      series: Array<number | null>,
      direction: MetricDirection,
      fmt: (v: number) => string
    ) {
      return {
        id,
        label,
        current: cur,
        previous: prev,
        currentDisplay: cur == null ? "—" : fmt(cur),
        previousDisplay: prev == null ? "—" : fmt(prev),
        trend: resolveTrendChip(series, cur, prev, direction),
        arrow: compareArrow(cur, prev, direction),
        countOnly: false,
        direction,
      };
    }

    function formatLap(min: number): string {
      const totalSec = Math.round(min * 60);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    const rankables: RankableMetric[] = [];
    // Snapshot uses individual competencies + PARAMETER % metrics (not rollup averages).
    for (const c of competencies.behavioural) {
      if (c.score == null) continue;
      rankables.push({
        id: `beh_${c.id}`,
        label: c.name,
        displayValue: `${c.score.toFixed(1)} / 5`,
        nativeValue: c.score,
        rankPct: scoreOutOf5ToRankPct(c.score),
      });
    }
    for (const c of competencies.technical) {
      if (c.score == null) continue;
      rankables.push({
        id: `tech_${c.id}`,
        label: c.name,
        displayValue: `${c.score.toFixed(1)} / 5`,
        nativeValue: c.score,
        rankPct: scoreOutOf5ToRankPct(c.score),
      });
    }
    if (currentM.planningAccuracy != null) {
      rankables.push({
        id: "planningAccuracy",
        label: "Planning Accuracy",
        displayValue: `${currentM.planningAccuracy}%`,
        nativeValue: currentM.planningAccuracy,
        rankPct: currentM.planningAccuracy,
      });
    }
    if (currentM.confirmationDiscipline != null) {
      rankables.push({
        id: "confirmationDiscipline",
        label: "Confirmation Discipline",
        displayValue: `${currentM.confirmationDiscipline}%`,
        nativeValue: currentM.confirmationDiscipline,
        rankPct: currentM.confirmationDiscipline,
      });
    }
    if (currentM.focusPct != null) {
      rankables.push({
        id: "focusPct",
        label: "Focus %",
        displayValue: `${currentM.focusPct}%`,
        nativeValue: currentM.focusPct,
        rankPct: currentM.focusPct,
      });
    }
    if (currentM.unplannedPct != null) {
      rankables.push({
        id: "unplannedPct",
        label: "Unplanned Work",
        displayValue: `${currentM.unplannedPct}%`,
        nativeValue: currentM.unplannedPct,
        rankPct: invertPctForRank(currentM.unplannedPct),
      });
    }
    if (currentM.billableSplitPct != null) {
      rankables.push({
        id: "billableSplitPct",
        label: "Billable Split",
        displayValue: `${currentM.billableSplitPct}%`,
        nativeValue: currentM.billableSplitPct,
        rankPct: currentM.billableSplitPct,
      });
    }

    const { strengths, needsAttention } = pickStrengthsAndNeeds(rankables, 3);

    return ser({
      resource: {
        employeeId: target.id.toString(),
        hrmsId: target.hrmsId,
        name: target.name,
        department: target.department?.name ?? null,
      },
      period: {
        id: periodId,
        from: current.from,
        to: current.to,
        previousFrom: previous.from,
        previousTo: previous.to,
        customWeeks: periodId === "custom" ? customWeeks : [],
        availableWeeks: last12WeekStarts().map((monday) => ({
          monday,
          label: weekLabel(monday),
        })),
      },
      summary: {
        behavioural: {
          current: currentM.behaviouralAvg,
          previous: previousM.behaviouralAvg,
          arrow: arrow(currentM.behaviouralAvg, previousM.behaviouralAvg, "higher_better"),
          trend: trend("behaviouralAvg", "higher_better"),
        },
        technical: {
          current: currentM.technicalAvg,
          previous: previousM.technicalAvg,
          arrow: arrow(currentM.technicalAvg, previousM.technicalAvg, "higher_better"),
          trend: trend("technicalAvg", "higher_better"),
        },
        planningAccuracy: {
          current: currentM.planningAccuracy,
          previous: previousM.planningAccuracy,
          arrow: arrow(currentM.planningAccuracy, previousM.planningAccuracy, "higher_better"),
          trend: trend("planningAccuracy", "higher_better"),
        },
        confirmationDiscipline: {
          current: currentM.confirmationDiscipline,
          previous: previousM.confirmationDiscipline,
          arrow: arrow(currentM.confirmationDiscipline, previousM.confirmationDiscipline, "higher_better"),
          trend: trend("confirmationDiscipline", "higher_better"),
        },
        focusPct: {
          current: currentM.focusPct,
          previous: previousM.focusPct,
          arrow: arrow(currentM.focusPct, previousM.focusPct, "higher_better"),
          trend: trend("focusPct", "higher_better"),
        },
        unplannedPct: {
          current: currentM.unplannedPct,
          previous: previousM.unplannedPct,
          arrow: arrow(currentM.unplannedPct, previousM.unplannedPct, "lower_better"),
          trend: trend("unplannedPct", "lower_better"),
        },
        billableSplitPct: {
          current: currentM.billableSplitPct,
          previous: previousM.billableSplitPct,
          arrow: arrow(currentM.billableSplitPct, previousM.billableSplitPct, "higher_better"),
          trend: trend("billableSplitPct", "higher_better"),
        },
      },
      competencies,
      productivity: productivityRows,
      contribution,
      unplanned,
      snapshot: {
        strengths: strengths.map((s) => ({ id: s.id, label: s.label, value: s.displayValue })),
        needsAttention: needsAttention.map((s) => ({
          id: s.id,
          label: s.label,
          value: s.displayValue,
        })),
        kpiAchievement: kpi,
      },
      weekHistory,
      trendBasis: basis.map((r, i) => ({
        from: r.from,
        to: r.to,
        label: `${r.from.slice(5)} – ${r.to.slice(5)}`,
        metrics: basisMetrics[i],
      })),
    });
  }

  private async computePeriodMetrics(
    employeeId: bigint,
    range: DateRange,
    workingDays: string[]
  ): Promise<PeriodMetrics> {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);

    const confirmations = await this.prisma.workConfirmation.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      include: {
        lines: {
          include: {
            allocation: {
              include: {
                activity: { select: { billable: true } },
                project: { select: { id: true, name: true, projectCode: true } },
              },
            },
          },
        },
      },
    });

    let planned = 0;
    let actual = 0;
    let billable = 0;
    let unplanned = 0;
    for (const c of confirmations) {
      for (const line of c.lines) {
        planned += line.plannedHours;
        actual += line.actualHours;
        if (line.kind === "unplanned") {
          unplanned += line.actualHours;
          // unplanned: no allocation activity → treat as non-billable
        } else if (line.allocation?.activity?.billable) {
          billable += line.actualHours;
        } else if (line.allocation && line.allocation.activity?.billable === false) {
          // non-billable
        } else if (!line.allocation) {
          // orphan planned/deviation without allocation — count as billable by default
          billable += line.actualHours;
        }
      }
    }

    const prodDays = await this.prisma.confirmationProductivityDay.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      include: { focusSessions: true, focusLaps: true },
    });

    let focusMs = 0;
    let lapMs = 0;
    let lapCount = 0;
    for (const day of prodDays) {
      for (const s of day.focusSessions) {
        focusMs += s.sessionAccumMs;
        if (s.segmentStartedAt) {
          const end = day.dayEndAt ?? new Date();
          const open = Math.max(0, end.getTime() - s.segmentStartedAt.getTime());
          focusMs += open;
        }
      }
      for (const lap of day.focusLaps) {
        lapMs += lap.durationMs;
        lapCount += 1;
        focusMs += lap.durationMs; // laps are completed focus; sessions may already account — use laps+accum without double count
      }
    }
    // Prefer: focus = sessionAccum + open segment + completed laps only once.
    // Reset and recompute cleanly:
    focusMs = 0;
    for (const day of prodDays) {
      for (const s of day.focusSessions) {
        focusMs += s.sessionAccumMs;
        if (s.segmentStartedAt) {
          const end = day.dayEndAt ?? new Date(`${isoDate(day.workDate)}T18:00:00.000Z`);
          focusMs += Math.max(0, end.getTime() - s.segmentStartedAt.getTime());
        }
      }
    }
    // If no sessions but laps exist, use lap total
    if (focusMs === 0 && lapMs > 0) focusMs = lapMs;

    const hasWorkData = confirmations.length > 0 || prodDays.length > 0;
    const focusHrs =
      focusMs > 0 ? round1(focusMs / 3_600_000) : hasWorkData ? 0 : null;
    const plannedOrActual = actual > 0 ? actual : planned > 0 ? planned : 0;
    const focusPct =
      focusHrs != null && plannedOrActual > 0 ? round0((focusHrs / plannedOrActual) * 100) : null;
    const avgLapDurationMin =
      lapCount > 0 ? round1(lapMs / lapCount / 60_000) : null;

    const planningAccuracy =
      planned > 0 ? round0((Math.min(actual, planned) / planned) * 100) : null;

    const workingDayCount = countWorkingDays(range.from, range.to, workingDays);
    const confirmedDays = new Set(confirmations.map((c) => isoDate(c.workDate))).size;
    const confirmationDiscipline =
      workingDayCount > 0 && confirmations.length > 0
        ? round0((confirmedDays / workingDayCount) * 100)
        : null;

    const unplannedPct = actual > 0 ? round0((unplanned / actual) * 100) : null;
    const billableSplitPct = actual > 0 ? round0((billable / actual) * 100) : null;

    const negLeaves = await this.prisma.resourceLeave.count({
      where: {
        employeeId,
        isDeleted: false,
        classification: "negative",
        leaveDate: { gte: from, lte: to },
      },
    });

    const wci = await this.prisma.weeklyCheckInSubmission.findMany({
      where: {
        employeeId,
        isDeleted: false,
        weekStart: { gte: from, lte: to },
      },
      select: {
        recognition: true,
        behaviouralRatings: true,
        technicalRatings: true,
      },
    });

    let appreciation = 0;
    let publicAppreciation = 0;
    const behScores: number[] = [];
    const techScores: number[] = [];
    for (const s of wci) {
      if (s.recognition === "Appreciate") appreciation += 1;
      if (s.recognition === "Appreciate Publicly") publicAppreciation += 1;
      const beh = avgRatingMap(s.behaviouralRatings);
      const tech = avgRatingMap(s.technicalRatings);
      if (beh != null) behScores.push(beh);
      if (tech != null) techScores.push(tech);
    }

    return {
      plannedHrs: hasWorkData || planned > 0 ? round1(planned) : null,
      actualHrs: hasWorkData || actual > 0 ? round1(actual) : null,
      billableHrs: hasWorkData || billable > 0 ? round1(billable) : null,
      focusHrs,
      focusPct,
      avgLapDurationMin,
      unplannedHrs: hasWorkData || unplanned > 0 ? round1(unplanned) : null,
      unplannedPct,
      planningAccuracy,
      confirmationDiscipline,
      billableSplitPct,
      negativeLeaves: negLeaves > 0 ? negLeaves : hasWorkData || wci.length > 0 ? 0 : null,
      appreciation: wci.length > 0 ? appreciation : null,
      publicAppreciation: wci.length > 0 ? publicAppreciation : null,
      behaviouralAvg: behScores.length ? round1(avg(behScores)!) : null,
      technicalAvg: techScores.length ? round1(avg(techScores)!) : null,
    };
  }

  private async computeCompetencies(
    employeeId: bigint,
    departmentId: bigint | null,
    range: DateRange
  ): Promise<{
    behavioural: CompetencyRow[];
    technical: CompetencyRow[];
    behaviouralAvg: number | null;
    technicalAvg: number | null;
  }> {
    if (!departmentId) {
      return { behavioural: [], technical: [], behaviouralAvg: null, technicalAvg: null };
    }
    const comps = await this.prisma.weeklyCheckInCompetency.findMany({
      where: { departmentId, isDeleted: false, isActive: true },
      orderBy: [{ kind: "asc" }, { sequence: "asc" }],
    });
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const submissions = await this.prisma.weeklyCheckInSubmission.findMany({
      where: {
        employeeId,
        isDeleted: false,
        weekStart: { gte: from, lte: to },
      },
      include: {
        resourceOwner: { select: { name: true, hrmsId: true } },
      },
      orderBy: { weekStart: "asc" },
    });

    const behavioural: CompetencyRow[] = [];
    const technical: CompetencyRow[] = [];
    for (const c of comps) {
      const scores: number[] = [];
      for (const s of submissions) {
        const map = (c.kind === "behavioural" ? s.behaviouralRatings : s.technicalRatings) as Record<
          string,
          number
        >;
        const v = map?.[c.code] ?? map?.[c.id.toString()];
        if (typeof v === "number" && v >= 1 && v <= 5) scores.push(v);
      }
      const row: CompetencyRow = {
        id: c.id.toString(),
        code: c.code,
        name: c.label,
        score: scores.length ? round1(avg(scores)!) : null,
        kind: c.kind === "behavioural" ? "behavioural" : "technical",
        remark: (c.remark ?? "").trim(),
        sequence: c.sequence,
      };
      if (c.kind === "behavioural") behavioural.push(row);
      else technical.push(row);
    }

    const behVals = behavioural.map((b) => b.score).filter((v): v is number => v != null);
    const techVals = technical.map((b) => b.score).filter((v): v is number => v != null);

    // 12-week detail for modal — remap rating keys to id + code + label for UI lookup
    const weekStarts = last12WeekStarts();
    const histFrom = new Date(`${weekStarts[weekStarts.length - 1]}T00:00:00.000Z`);
    const histToSunday = addDaysISO(weekStarts[0]!, 6);
    const histTo = new Date(`${histToSunday}T23:59:59.999Z`);
    const histSubs = await this.prisma.weeklyCheckInSubmission.findMany({
      where: {
        employeeId,
        isDeleted: false,
        weekStart: { gte: histFrom, lte: histTo },
      },
      include: { resourceOwner: { select: { name: true } } },
      orderBy: { weekStart: "asc" },
    });

    const remapRatings = (
      raw: unknown,
      kind: "behavioural" | "technical"
    ): Record<string, number> => {
      const src = (raw ?? {}) as Record<string, number>;
      const out: Record<string, number> = { ...src };
      const list = kind === "behavioural" ? behavioural : technical;
      for (const row of list) {
        const v =
          src[row.code] ??
          src[row.id] ??
          src[row.name] ??
          Object.entries(src).find(([k]) => k === row.code || k === row.id)?.[1];
        if (typeof v === "number" && v >= 1 && v <= 5) {
          out[row.code] = v;
          out[row.id] = v;
          out[row.name] = v;
        }
      }
      return out;
    };

    return {
      behavioural,
      technical,
      behaviouralAvg: behVals.length ? round1(avg(behVals)!) : null,
      technicalAvg: techVals.length ? round1(avg(techVals)!) : null,
      historyWeeks: weekStarts.slice().reverse(),
      history: histSubs.map((s) => ({
        weekStart: isoDate(s.weekStart),
        raterName: s.resourceOwner.name,
        behavioural: remapRatings(s.behaviouralRatings, "behavioural"),
        technical: remapRatings(s.technicalRatings, "technical"),
      })),
    } as {
      behavioural: CompetencyRow[];
      technical: CompetencyRow[];
      behaviouralAvg: number | null;
      technicalAvg: number | null;
      historyWeeks?: string[];
      history?: Array<{
        weekStart: string;
        raterName: string;
        behavioural: unknown;
        technical: unknown;
      }>;
    };
  }

  private async computeContribution(employeeId: bigint, range: DateRange) {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const confirmations = await this.prisma.workConfirmation.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      include: {
        lines: {
          include: {
            allocation: {
              include: {
                activity: { select: { billable: true } },
                project: { select: { name: true, projectCode: true } },
              },
            },
          },
        },
      },
    });

    type Agg = { project: string; planned: number; actual: number; billable: number };
    const byProject = new Map<string, Agg>();
    for (const c of confirmations) {
      for (const line of c.lines) {
        // Contribution = Project Master only (allocated planned/deviation lines).
        // Skip unplanned free-text projectLabel rows (e.g. "Electricity Issue", discussions).
        if (line.kind === "unplanned" || line.allocationId == null) continue;
        const project = line.allocation?.project;
        if (!project?.name?.trim() && !project?.projectCode) continue;
        const name = project.name?.trim() || project.projectCode;
        const row = byProject.get(name) ?? { project: name, planned: 0, actual: 0, billable: 0 };
        row.planned += line.plannedHours;
        row.actual += line.actualHours;
        if (line.allocation?.activity?.billable === true) {
          row.billable += line.actualHours;
        }
        byProject.set(name, row);
      }
    }
    const rows = [...byProject.values()].sort((a, b) => b.actual - a.actual);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    return {
      rows: rows.map((r) => ({
        project: r.project,
        plannedHrs: round1(r.planned),
        actualHrs: round1(r.actual),
        sharePct: totalActual > 0 ? round0((r.actual / totalActual) * 100) : null,
        billableHrs: round1(r.billable),
      })),
      totals: {
        plannedHrs: round1(rows.reduce((s, r) => s + r.planned, 0)),
        actualHrs: round1(totalActual),
        sharePct: totalActual > 0 ? 100 : null,
        billableHrs: round1(rows.reduce((s, r) => s + r.billable, 0)),
      },
    };
  }

  private async computeUnplannedByReason(employeeId: bigint, range: DateRange) {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const confirmations = await this.prisma.workConfirmation.findMany({
      where: {
        employeeId,
        isDeleted: false,
        workDate: { gte: from, lte: to },
      },
      include: { lines: true },
    });

    const hoursByReason = new Map<string, number>(
      UNPLANNED_WORK_REASONS.map((r) => [r, 0])
    );
    let otherHrs = 0;
    for (const c of confirmations) {
      for (const line of c.lines) {
        if (line.kind !== "unplanned") continue;
        const reason = (line.reason ?? "").trim();
        if (hoursByReason.has(reason)) {
          hoursByReason.set(reason, (hoursByReason.get(reason) ?? 0) + line.actualHours);
        } else {
          // Legacy / free-text / empty reasons still count toward Unplanned % — keep totals aligned.
          otherHrs += line.actualHours;
        }
      }
    }

    const knownHrs = [...hoursByReason.values()].reduce((s, h) => s + h, 0);
    const totalHrs = knownHrs + otherHrs;
    const rows: Array<{ reason: string; hrs: number; sharePct: number | null }> =
      UNPLANNED_WORK_REASONS.map((reason) => {
        const hrs = hoursByReason.get(reason) ?? 0;
        return {
          reason,
          hrs: round1(hrs),
          sharePct: totalHrs > 0 ? round0((hrs / totalHrs) * 100) : null,
        };
      });
    if (otherHrs > 0) {
      rows.push({
        reason: "Other",
        hrs: round1(otherHrs),
        sharePct: totalHrs > 0 ? round0((otherHrs / totalHrs) * 100) : null,
      });
    }

    return {
      rows,
      totals: {
        hrs: round1(totalHrs),
        sharePct: totalHrs > 0 ? 100 : null,
      },
    };
  }

  private async computeWeekHistory(employeeId: bigint, workingDays: string[]) {
    const weeks = last12WeekStarts().slice().reverse();
    const results = [];
    for (const monday of weeks) {
      const range = { from: monday, to: addDaysISO(monday, 6) };
      const m = await this.computePeriodMetrics(employeeId, range, workingDays);
      results.push({ weekStart: monday, label: weekLabel(monday), metrics: m });
    }
    return results;
  }

  private async computeLastQuarterKpis(employeeId: bigint) {
    const { calendarYear, assessmentCycle } = lastCompletedQuarter();
    const items = await this.prisma.kpiFrameworkItem.findMany({
      where: {
        employeeId,
        isDeleted: false,
        calendarYear,
        assessmentCycle,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        kpiName: true,
        kpiResult: true,
        kpiScore: true,
        weightage: true,
        status: true,
        unit: { select: { name: true } },
      },
    });
    return {
      calendarYear,
      assessmentCycle,
      label: `Last Quarter KPI Achievement (${assessmentCycle} ${calendarYear})`,
      items: items.map((i) => ({
        id: i.id.toString(),
        name: i.kpiName,
        result: i.kpiResult != null ? Number(i.kpiResult) : null,
        score: i.kpiScore != null ? Number(i.kpiScore) : null,
        unit: i.unit.name,
        status: i.status,
      })),
    };
  }
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function avgRatingMap(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const vals = Object.values(raw as Record<string, unknown>).filter(
    (v): v is number => typeof v === "number" && v >= 1 && v <= 5
  );
  return avg(vals);
}

function countWorkingDays(from: string, to: string, workingDays: string[]): number {
  const set = new Set(workingDays.length ? workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let n = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const dt = new Date(`${d}T12:00:00`);
    if (set.has(labels[dt.getDay()]!)) n += 1;
  }
  return n;
}

function weekLabel(monday: string): string {
  const end = addDaysISO(monday, 6);
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(monday)} – ${fmt(end)}`;
}
