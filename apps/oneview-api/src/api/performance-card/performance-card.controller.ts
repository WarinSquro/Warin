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
  classifyTrend,
  compareArrow,
  invertPctForRank,
  isoDate,
  last12WeekStarts,
  lastCompletedQuarter,
  pickStrengthsAndNeeds,
  previousComparableRange,
  resolvePeriodRange,
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

    const [currentM, previousM, basisMetrics, competencies, contribution, weekHistory, kpi] =
      await Promise.all([
        this.computePeriodMetrics(target.id, current, workingDays),
        this.computePeriodMetrics(target.id, previous, workingDays),
        Promise.all(basis.map((r) => this.computePeriodMetrics(target.id, r, workingDays))),
        this.computeCompetencies(target.id, target.departmentId, current),
        this.computeContribution(target.id, current),
        this.computeWeekHistory(target.id, workingDays),
        this.computeLastQuarterKpis(target.id),
      ]);

    const trend = (key: keyof PeriodMetrics, dir: MetricDirection): TrendStatus =>
      classifyTrend(
        basisMetrics.map((m) => m[key] as number | null),
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
        trend: classifyTrend(series, direction),
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
    if (currentM.behaviouralAvg != null) {
      rankables.push({
        id: "beh_avg",
        label: "Behavioural Competency",
        displayValue: `${currentM.behaviouralAvg.toFixed(1)} / 5`,
        nativeValue: currentM.behaviouralAvg,
        rankPct: scoreOutOf5ToRankPct(currentM.behaviouralAvg),
      });
    }
    if (currentM.technicalAvg != null) {
      rankables.push({
        id: "tech_avg",
        label: "Technical Competency",
        displayValue: `${currentM.technicalAvg.toFixed(1)} / 5`,
        nativeValue: currentM.technicalAvg,
        rankPct: scoreOutOf5ToRankPct(currentM.technicalAvg),
      });
    }
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

    const focusHrs = focusMs > 0 ? round1(focusMs / 3_600_000) : confirmations.length || prodDays.length ? 0 : null;
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
      workingDayCount > 0 ? round0((confirmedDays / workingDayCount) * 100) : null;

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

    const hasConfData = confirmations.length > 0 || prodDays.length > 0 || wci.length > 0 || negLeaves > 0;

    return {
      plannedHrs: hasConfData || planned > 0 ? round1(planned) : null,
      actualHrs: hasConfData || actual > 0 ? round1(actual) : null,
      billableHrs: hasConfData || billable > 0 ? round1(billable) : null,
      focusHrs,
      focusPct,
      avgLapDurationMin,
      unplannedHrs: hasConfData || unplanned > 0 ? round1(unplanned) : null,
      unplannedPct,
      planningAccuracy,
      confirmationDiscipline,
      billableSplitPct,
      negativeLeaves: negLeaves,
      appreciation,
      publicAppreciation,
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
        const name =
          line.allocation?.project?.name ??
          (line.projectLabel?.trim() || "Unplanned / Other");
        const row = byProject.get(name) ?? { project: name, planned: 0, actual: 0, billable: 0 };
        row.planned += line.plannedHours;
        row.actual += line.actualHours;
        if (line.kind !== "unplanned" && line.allocation?.activity?.billable !== false) {
          if (line.allocation?.activity?.billable === true || !line.allocation) {
            row.billable += line.actualHours;
          }
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
