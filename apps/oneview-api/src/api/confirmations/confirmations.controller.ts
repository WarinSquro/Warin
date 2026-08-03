import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { ConfirmationLineKind } from "@prisma/client";
import { MailService } from "@oneview/mail";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { RequirePermissions } from "../auth/guards";
import {
  assertCanPlanForEmployee,
  immediateReportEmployeeIds,
} from "../auth/resource-scope";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function isoDate(d: Date): string {
  // Prefer calendar date (DATE columns) without UTC day-shift.
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalISOFrom(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalISO(): string {
  return todayLocalISOFrom(new Date());
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return todayLocalISOFrom(d);
}

function mondayOfISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return todayLocalISOFrom(d);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatPlanDateLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isDelayed(submittedAt: Date, workDateIso: string): boolean {
  return submittedAt.getTime() > new Date(`${workDateIso}T10:00:00`).getTime();
}

type LineBody = {
  allocationId?: string | null;
  projectLabel: string;
  milestoneLabel?: string;
  activity: string;
  plannedHours: number;
  actualHours: number;
  kind: ConfirmationLineKind;
  reason?: string;
  tasks?: string[];
};

type SubmitBody = {
  workDate: string;
  isMissedPosting?: boolean;
  missReason?: string | null;
  lines: LineBody[];
};

type RemindBody = {
  employeeHrmsId: string;
  workDate?: string;
};

type ProductivityLapBody = {
  id?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

type ProductivityFocusBody = {
  laps?: ProductivityLapBody[];
  sessionAccumMs?: number;
  segmentStartedAt?: string | null;
};

type ProductivityUpsertBody = {
  workDate: string;
  workday?: {
    dayStart?: string | null;
    lunchOut?: string | null;
    lunchIn?: string | null;
    dayEnd?: string | null;
  };
  focusByAllocation?: Record<string, ProductivityFocusBody>;
  activeTimerId?: string | null;
  workHours?: number | null;
};

function parseOptionalDateTime(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

@ApiTags("confirmations")
@ApiBearerAuth()
@Controller("confirmations")
export class ConfirmationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService
  ) {}

  private async employeeFromJwt(user: JwtPayload) {
    const emp = await this.prisma.employee.findFirst({
      where: { hrmsId: user.hrmsId, isDeleted: false },
    });
    if (!emp) throw new NotFoundException("Employee not found");
    return emp;
  }

  private mapConfirmation(c: {
    id: bigint;
    workDate: Date;
    submittedAt: Date;
    isMissedPosting: boolean;
    missReason: string | null;
    hasDeviation: boolean;
    employee: { hrmsId: string; name: string };
    lines: {
      id: bigint;
      allocationId: bigint | null;
      projectLabel: string;
      milestoneLabel: string;
      activity: string;
      plannedHours: number;
      actualHours: number;
      kind: ConfirmationLineKind;
      reason: string;
      tasks: string[];
    }[];
  }) {
    return {
      id: c.id.toString(),
      employeeHrmsId: c.employee.hrmsId,
      employeeName: c.employee.name,
      workDate: isoDate(c.workDate),
      submittedAt: c.submittedAt.toISOString(),
      submittedAtLabel: formatTime(c.submittedAt),
      isMissedPosting: c.isMissedPosting,
      missReason: c.missReason,
      hasDeviation: c.hasDeviation,
      lines: c.lines.map((l) => ({
        id: l.id.toString(),
        allocationId: l.allocationId?.toString() ?? null,
        projectLabel: l.projectLabel,
        milestoneLabel: l.milestoneLabel,
        activity: l.activity,
        plannedHours: l.plannedHours,
        actualHours: l.actualHours,
        kind: l.kind,
        reason: l.reason,
        tasks: l.tasks,
      })),
    };
  }

  @Get()
  @RequirePermissions(
    "confirmations",
    "reports.deployment",
    "reports.performance",
    "reports.execution",
    "reports.daily_work"
  )
  async list(@Query("from") from?: string, @Query("to") to?: string) {
    const fromDate = parseDate(from ?? todayLocalISO());
    const toDate = parseDate(to ?? from ?? todayLocalISO());
    if (!fromDate || !toDate) throw new BadRequestException("Invalid from/to");

    const rows = await this.prisma.workConfirmation.findMany({
      where: {
        isDeleted: false,
        workDate: { gte: fromDate, lte: toDate },
      },
      include: {
        employee: { select: { hrmsId: true, name: true } },
        lines: { orderBy: { id: "asc" } },
      },
      orderBy: [{ workDate: "asc" }, { id: "asc" }],
    });
    return ser(rows.map((r) => this.mapConfirmation(r)));
  }

  @Get("me")
  @RequirePermissions("confirmations")
  async mine(
    @Req() req: { user: JwtPayload },
    @Query("date") date?: string
  ) {
    const emp = await this.employeeFromJwt(req.user);
    const workDate = parseDate(date ?? todayLocalISO());
    if (!workDate) throw new BadRequestException("Invalid date");

    const row = await this.prisma.workConfirmation.findFirst({
      where: { employeeId: emp.id, workDate, isDeleted: false },
      include: {
        employee: { select: { hrmsId: true, name: true } },
        lines: { orderBy: { id: "asc" } },
      },
    });
    if (!row) return null;
    return ser(this.mapConfirmation(row));
  }

  @Get("me/miss-count")
  @RequirePermissions("confirmations")
  async missCount(
    @Req() req: { user: JwtPayload },
    @Query("month") month?: string
  ) {
    const emp = await this.employeeFromJwt(req.user);
    const prefix = (month ?? todayLocalISO().slice(0, 7)).slice(0, 7);
    const start = parseDate(`${prefix}-01`);
    if (!start) throw new BadRequestException("Invalid month");
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const count = await this.prisma.workConfirmation.count({
      where: {
        employeeId: emp.id,
        isMissedPosting: true,
        isDeleted: false,
        workDate: { gte: start, lt: end },
      },
    });
    return { month: prefix, count };
  }

  @Get("me/productivity")
  @RequirePermissions("confirmations")
  async getProductivity(
    @Req() req: { user: JwtPayload },
    @Query("date") date?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const emp = await this.employeeFromJwt(req.user);
    const fromDate = parseDate(from ?? date ?? todayLocalISO());
    const toDate = parseDate(to ?? date ?? from ?? todayLocalISO());
    if (!fromDate || !toDate) throw new BadRequestException("Invalid date range");

    const rows = await this.prisma.confirmationProductivityDay.findMany({
      where: {
        employeeId: emp.id,
        isDeleted: false,
        workDate: { gte: fromDate, lte: toDate },
      },
      include: {
        focusSessions: true,
        focusLaps: { orderBy: { id: "asc" } },
      },
      orderBy: { workDate: "asc" },
    });

    return ser({
      days: Object.fromEntries(rows.map((r) => [isoDate(r.workDate), this.mapProductivityDay(r)])),
    });
  }

  @Put("me/productivity")
  @RequirePermissions("confirmations")
  async upsertProductivity(
    @Req() req: { user: JwtPayload },
    @Body() body: ProductivityUpsertBody
  ) {
    const emp = await this.employeeFromJwt(req.user);
    const workDate = parseDate(body.workDate);
    if (!workDate) throw new BadRequestException("workDate is required");

    const workday = body.workday ?? {};
    const focusByAllocation = body.focusByAllocation ?? {};
    const allocationKeys = Object.keys(focusByAllocation);

    const candidateAllocIds = allocationKeys
      .filter((k) => /^\d+$/.test(k))
      .map((k) => BigInt(k));
    const validAllocIds = new Set<string>();
    if (candidateAllocIds.length > 0) {
      const found = await this.prisma.allocation.findMany({
        where: { id: { in: candidateAllocIds }, isDeleted: false },
        select: { id: true },
      });
      for (const a of found) validAllocIds.add(a.id.toString());
    }

    const resolveAllocId = (key: string): bigint | null =>
      /^\d+$/.test(key) && validAllocIds.has(key) ? BigInt(key) : null;

    const saved = await this.prisma.$transaction(async (tx) => {
      const day = await tx.confirmationProductivityDay.upsert({
        where: {
          employeeId_workDate: { employeeId: emp.id, workDate },
        },
        create: {
          employeeId: emp.id,
          workDate,
          dayStartAt: parseOptionalDateTime(workday.dayStart),
          lunchOutAt: parseOptionalDateTime(workday.lunchOut),
          lunchInAt: parseOptionalDateTime(workday.lunchIn),
          dayEndAt: parseOptionalDateTime(workday.dayEnd),
          workHoursSnapshot:
            body.workHours == null || Number.isNaN(Number(body.workHours))
              ? null
              : Number(body.workHours),
          activeAllocationKey: body.activeTimerId ?? null,
          createdBy: emp.id,
          modifiedBy: emp.id,
        },
        update: {
          dayStartAt: parseOptionalDateTime(workday.dayStart),
          lunchOutAt: parseOptionalDateTime(workday.lunchOut),
          lunchInAt: parseOptionalDateTime(workday.lunchIn),
          dayEndAt: parseOptionalDateTime(workday.dayEnd),
          workHoursSnapshot:
            body.workHours == null || Number.isNaN(Number(body.workHours))
              ? null
              : Number(body.workHours),
          activeAllocationKey: body.activeTimerId ?? null,
          isDeleted: false,
          deletedAt: null,
          modifiedBy: emp.id,
          version: { increment: 1 },
        },
      });

      await tx.confirmationFocusLap.deleteMany({ where: { dayId: day.id } });
      await tx.confirmationFocusSession.deleteMany({ where: { dayId: day.id } });

      for (const key of allocationKeys) {
        const st = focusByAllocation[key] ?? {};
        const allocId = resolveAllocId(key);
        await tx.confirmationFocusSession.create({
          data: {
            dayId: day.id,
            allocationId: allocId,
            allocationKey: key,
            sessionAccumMs: Math.max(0, Math.floor(Number(st.sessionAccumMs) || 0)),
            segmentStartedAt: parseOptionalDateTime(st.segmentStartedAt),
          },
        });
        const laps = Array.isArray(st.laps) ? st.laps : [];
        for (const lap of laps) {
          const startedAt = parseOptionalDateTime(lap.startedAt);
          const endedAt = parseOptionalDateTime(lap.endedAt);
          if (!startedAt || !endedAt) continue;
          await tx.confirmationFocusLap.create({
            data: {
              dayId: day.id,
              allocationId: allocId,
              allocationKey: key,
              startedAt,
              endedAt,
              durationMs: Math.max(0, Math.floor(Number(lap.durationMs) || 0)),
            },
          });
        }
      }

      return tx.confirmationProductivityDay.findUniqueOrThrow({
        where: { id: day.id },
        include: {
          focusSessions: true,
          focusLaps: { orderBy: { id: "asc" } },
        },
      });
    });

    return ser({
      workDate: isoDate(saved.workDate),
      day: this.mapProductivityDay(saved),
    });
  }

  private mapProductivityDay(row: {
    workDate: Date;
    dayStartAt: Date | null;
    lunchOutAt: Date | null;
    lunchInAt: Date | null;
    dayEndAt: Date | null;
    workHoursSnapshot: number | null;
    activeAllocationKey: string | null;
    focusSessions: {
      allocationKey: string;
      sessionAccumMs: number;
      segmentStartedAt: Date | null;
    }[];
    focusLaps: {
      id: bigint;
      allocationKey: string;
      startedAt: Date;
      endedAt: Date;
      durationMs: number;
    }[];
  }) {
    const focusByAllocation: Record<
      string,
      {
        laps: { id: string; startedAt: string; endedAt: string; durationMs: number }[];
        sessionAccumMs: number;
        segmentStartedAt: string | null;
      }
    > = {};

    for (const s of row.focusSessions) {
      focusByAllocation[s.allocationKey] = {
        laps: [],
        sessionAccumMs: s.sessionAccumMs,
        segmentStartedAt: s.segmentStartedAt?.toISOString() ?? null,
      };
    }
    for (const lap of row.focusLaps) {
      if (!focusByAllocation[lap.allocationKey]) {
        focusByAllocation[lap.allocationKey] = {
          laps: [],
          sessionAccumMs: 0,
          segmentStartedAt: null,
        };
      }
      focusByAllocation[lap.allocationKey].laps.push({
        id: lap.id.toString(),
        startedAt: lap.startedAt.toISOString(),
        endedAt: lap.endedAt.toISOString(),
        durationMs: lap.durationMs,
      });
    }

    const workday: Record<string, string> = {};
    if (row.dayStartAt) workday.dayStart = row.dayStartAt.toISOString();
    if (row.lunchOutAt) workday.lunchOut = row.lunchOutAt.toISOString();
    if (row.lunchInAt) workday.lunchIn = row.lunchInAt.toISOString();
    if (row.dayEndAt) workday.dayEnd = row.dayEndAt.toISOString();

    return {
      workday,
      focusByAllocation,
      workHours: row.workHoursSnapshot ?? undefined,
      activeTimerId: row.activeAllocationKey,
    };
  }

  @Post()
  @RequirePermissions("confirmations")
  async submit(@Req() req: { user: JwtPayload }, @Body() body: SubmitBody) {
    const emp = await this.employeeFromJwt(req.user);
    const workDate = parseDate(body.workDate);
    if (!workDate) throw new BadRequestException("workDate is required");
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException("At least one confirmation line is required");
    }

    const rawLines = body.lines.map((l) => {
      const kind = l.kind;
      if (!["planned", "deviation", "unplanned"].includes(kind)) {
        throw new BadRequestException(`Invalid line kind: ${l.kind}`);
      }
      if (kind === "deviation" && !l.reason?.trim()) {
        throw new BadRequestException("Deviation lines require a reason");
      }
      const allocationIdRaw =
        l.allocationId != null && String(l.allocationId).trim() !== ""
          ? String(l.allocationId).trim()
          : null;
      return {
        allocationIdRaw,
        projectLabel: (l.projectLabel || "Unplanned").trim(),
        milestoneLabel: (l.milestoneLabel ?? "").trim(),
        activity: (l.activity || "Unplanned work").trim(),
        plannedHours: Number(l.plannedHours) || 0,
        actualHours: Number(l.actualHours) || 0,
        kind,
        reason: l.reason?.trim() ?? "",
        tasks: Array.isArray(l.tasks) ? l.tasks.map(String) : [],
      };
    });

    const candidateIds = [
      ...new Set(
        rawLines
          .map((l) => l.allocationIdRaw)
          .filter((id): id is string => !!id && /^\d+$/.test(id))
      ),
    ].map((id) => BigInt(id));

    const validAllocationIds = new Set<string>();
    if (candidateIds.length > 0) {
      const found = await this.prisma.allocation.findMany({
        where: { id: { in: candidateIds }, isDeleted: false },
        select: { id: true },
      });
      for (const row of found) validAllocationIds.add(row.id.toString());
    }

    const lines = rawLines.map(({ allocationIdRaw, ...rest }) => ({
      ...rest,
      allocationId:
        allocationIdRaw && validAllocationIds.has(allocationIdRaw)
          ? BigInt(allocationIdRaw)
          : null,
    }));

    const hasDeviation = lines.some((l) => l.kind === "deviation" || l.kind === "unplanned");
    const submittedAt = new Date();

    const existing = await this.prisma.workConfirmation.findFirst({
      where: { employeeId: emp.id, workDate, isDeleted: false },
    });

    const include = {
      employee: { select: { hrmsId: true, name: true } },
      lines: { orderBy: { id: "asc" as const } },
    };

    if (existing) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.workConfirmationLine.deleteMany({
          where: { confirmationId: existing.id },
        });
        return tx.workConfirmation.update({
          where: { id: existing.id },
          data: {
            submittedAt,
            isMissedPosting: Boolean(body.isMissedPosting),
            missReason: body.isMissedPosting ? body.missReason?.trim() || null : null,
            hasDeviation,
            version: { increment: 1 },
            lines: { create: lines },
          },
          include,
        });
      });
      return ser(this.mapConfirmation(updated));
    }

    const created = await this.prisma.workConfirmation.create({
      data: {
        employeeId: emp.id,
        workDate,
        submittedAt,
        isMissedPosting: Boolean(body.isMissedPosting),
        missReason: body.isMissedPosting ? body.missReason?.trim() || null : null,
        hasDeviation,
        lines: { create: lines },
      },
      include,
    });
    return ser(this.mapConfirmation(created));
  }

  @Post("remind")
  @RequirePermissions("confirmations")
  async remind(@Req() req: { user: JwtPayload }, @Body() body: RemindBody) {
    const hrmsId = body.employeeHrmsId?.trim();
    if (!hrmsId) throw new BadRequestException("employeeHrmsId is required");

    const workDateIso = (body.workDate ?? todayLocalISO()).slice(0, 10);
    const workDate = parseDate(workDateIso);
    if (!workDate) throw new BadRequestException("Invalid workDate");

    const employee = await this.prisma.employee.findFirst({
      where: { hrmsId, isDeleted: false, status: "active" },
    });
    if (!employee) throw new NotFoundException("Employee not found");
    await assertCanPlanForEmployee(this.prisma, req.user, employee);
    const toEmail = employee.email?.trim();
    if (!toEmail) {
      throw new BadRequestException("Employee has no email address on file");
    }

    const existing = await this.prisma.workConfirmation.findFirst({
      where: { employeeId: employee.id, workDate, isDeleted: false },
    });
    if (existing) {
      throw new BadRequestException("Employee has already confirmed for this date");
    }

    const manager = await this.employeeFromJwt(req.user);
    const appUrl = (process.env.APP_PUBLIC_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
    const confirmUrl = `${appUrl}/confirmations`;
    const workDateLabel = formatPlanDateLabel(workDateIso);

    const text = [
      `Hi ${employee.name},`,
      "",
      `${manager.name} is reminding you to confirm your work for ${workDateLabel}.`,
      `Open OneView and submit your confirmation:`,
      confirmUrl,
      "",
      "Thank you,",
      "OneView",
    ].join("\n");
    const html = `
      <p>Hi ${employee.name},</p>
      <p><strong>${manager.name}</strong> is reminding you to confirm your work for <strong>${workDateLabel}</strong>.</p>
      <p><a href="${confirmUrl}">Open Work Confirmation</a></p>
      <p style="color:#666;font-size:13px">OneView</p>
    `;

    let mailResult;
    try {
      mailResult = await this.mail.send({
        to: toEmail,
        subject: `Reminder: confirm your work for ${workDateLabel}`,
        text,
        html,
        template: "confirmation-remind",
        context: {
          employeeName: employee.name,
          managerName: manager.name,
          workDate: workDateIso,
          confirmUrl,
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Mail send failed";
      throw new ServiceUnavailableException(`Failed to send reminder email: ${detail}`);
    }

    // console/dry-run logs only — never claim the employee was notified
    if (mailResult.provider === "console" || !mailResult.accepted?.length) {
      throw new ServiceUnavailableException(
        "Mail is not configured for delivery (set MAIL_DRY_RUN=false and MAIL_PROVIDER=smtp). Reminder was not sent."
      );
    }

    return ser({
      message: `Reminder sent to ${employee.name}`,
      employeeHrmsId: hrmsId,
      workDate: workDateIso,
      deliveredVia: "email",
      to: toEmail,
    });
  }

  @Get("team")
  @RequirePermissions("confirmations")
  async team(
    @Req() req: { user: JwtPayload },
    @Query("weekStart") weekStart?: string,
    @Query("asOf") asOf?: string
  ) {
    const today = (asOf ?? todayLocalISO()).slice(0, 10);
    const mon = mondayOfISO(weekStart ?? today);
    const fri = addDaysISO(mon, 4);
    const weekDates = [0, 1, 2, 3, 4].map((i) => addDaysISO(mon, i));
    const todayIndex = weekDates.indexOf(today);

    const scopedIds = await immediateReportEmployeeIds(this.prisma, req.user);

    const roster = await this.prisma.employee.findMany({
      where: {
        isDeleted: false,
        status: "active",
        ...(scopedIds ? { id: { in: scopedIds } } : {}),
      },
      include: {
        skills: { include: { skill: true }, take: 1 },
      },
      orderBy: { name: "asc" },
    });

    const confirmations = await this.prisma.workConfirmation.findMany({
      where: {
        isDeleted: false,
        workDate: { gte: parseDate(mon)!, lte: parseDate(fri)! },
        employeeId: { in: roster.map((e) => e.id) },
      },
      include: {
        lines: true,
        employee: { select: { hrmsId: true, name: true } },
      },
    });

    const byEmpDate = new Map<string, (typeof confirmations)[0]>();
    for (const c of confirmations) {
      byEmpDate.set(`${c.employeeId.toString()}:${isoDate(c.workDate)}`, c);
    }

    type DayStatus =
      | "confirmed"
      | "confirmed_delayed"
      | "deviation"
      | "deviation_delayed"
      | "pending"
      | "leave"
      | "future";

    const rows = roster.map((e) => {
      const week = weekDates.map((d, i): DayStatus => {
        if (todayIndex >= 0 && i > todayIndex) return "future";
        if (d > today) return "future";
        const c = byEmpDate.get(`${e.id.toString()}:${d}`);
        if (!c) return "pending";
        const delayed = isDelayed(c.submittedAt, d);
        if (c.hasDeviation) return delayed ? "deviation_delayed" : "deviation";
        return delayed ? "confirmed_delayed" : "confirmed";
      });

      const todayStatus = todayIndex >= 0 ? week[todayIndex] : "pending";
      const todayConf =
        todayIndex >= 0
          ? byEmpDate.get(`${e.id.toString()}:${weekDates[todayIndex]}`)
          : undefined;

      let todayLabel = "Not yet confirmed";
      if (todayStatus === "future") todayLabel = "—";
      else if (todayStatus === "pending") todayLabel = "Not yet confirmed";
      else if (todayStatus === "deviation" || todayStatus === "deviation_delayed") {
        todayLabel = "Deviation reported";
      } else if (todayConf) {
        todayLabel = `Confirmed ${formatTime(todayConf.submittedAt)}`;
      }

      return {
        id: e.hrmsId,
        name: e.name,
        initials: initials(e.name),
        role: e.skills[0]?.skill.name ?? "—",
        week,
        todayLabel,
        todayStatus,
      };
    });

    const todayRows = rows.filter((r) => r.todayStatus !== "future");
    const confirmedToday = todayRows.filter((r) =>
      ["confirmed", "confirmed_delayed"].includes(r.todayStatus)
    ).length;
    const pending = todayRows.filter((r) => r.todayStatus === "pending").length;
    const deviations = todayRows.filter((r) =>
      ["deviation", "deviation_delayed"].includes(r.todayStatus)
    ).length;
    const team = todayRows.length;
    const confirmedPct = team > 0 ? Math.round((confirmedToday / team) * 100) : 0;

    const deviationFeed = confirmations
      .filter((c) => isoDate(c.workDate) === today && c.hasDeviation)
      .flatMap((c) =>
        c.lines
          .filter((l) => l.kind === "deviation" || l.kind === "unplanned")
          .map((l) => ({
            id: l.id.toString(),
            name: c.employee.name,
            initials: initials(c.employee.name),
            line: `${l.projectLabel}${l.milestoneLabel ? ` · ${l.activity}` : ` · ${l.activity}`}`,
            planned: l.plannedHours,
            actual: l.actualHours,
            reason: l.reason || (l.kind === "unplanned" ? "Unplanned work" : "—"),
            time: formatTime(c.submittedAt),
          }))
      );

    return ser({
      weekStart: mon,
      asOf: today,
      kpis: {
        confirmedPct,
        confirmedCount: confirmedToday,
        pending,
        deviations,
        onLeave: 0,
        team,
      },
      rows,
      deviations: deviationFeed,
    });
  }
}
