import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CapacityBasis,
  Prisma,
  SettingsScheduleStatus,
  type AppSettings,
  type CompanyOffDay,
} from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export type SettingsPayload = {
  idleBelow: number;
  optimalTo: number;
  excellent: number;
  good: number;
  needsAttention: number;
  capacityBasis: "billable" | "total";
  overallocationLimit: number;
  workingHoursPerDay: number;
  workingDays: string[];
  companyOffDays: { date: string; label: string }[];
};

export type SettingsSnapshot = {
  idleBelow: number;
  optimalTo: number;
  excellent: number;
  good: number;
  needsAttention: number;
  capacityBasis: string;
  overallocationLimit: number;
  workingHoursPerDay: number;
  workingDays: string[];
  companyOffDays: { date: string; label: string }[];
};

export function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function dateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatEffectiveLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function snapshotFromDb(settings: AppSettings, offDays: CompanyOffDay[]): SettingsSnapshot {
  return {
    idleBelow: settings.idleBelow,
    optimalTo: settings.optimalTo,
    excellent: settings.excellent,
    good: settings.good,
    needsAttention: settings.needsAttention,
    capacityBasis: settings.capacityBasis,
    overallocationLimit: settings.overallocationLimit,
    workingHoursPerDay: settings.workingHoursPerDay,
    workingDays: [...settings.workingDays],
    companyOffDays: offDays.map((d) => ({ date: dateKey(d.date), label: d.label })),
  };
}

export function payloadFromBody(body: Record<string, unknown>, fallbackOffDays: { date: string; label: string }[]): SettingsPayload {
  const capacityBasis =
    body.capacityBasis === "total" || body.capacityBasis === "billable"
      ? body.capacityBasis
      : "billable";
  const companyOffDays = Array.isArray(body.companyOffDays)
    ? (body.companyOffDays as { date: string; label: string }[]).map((d) => ({
        date: dateKey(d.date),
        label: String(d.label ?? ""),
      }))
    : fallbackOffDays;
  return {
    idleBelow: Number(body.idleBelow ?? 70),
    optimalTo: Number(body.optimalTo ?? 100),
    excellent: Number(body.excellent ?? 95),
    good: Number(body.good ?? 90),
    needsAttention: Number(body.needsAttention ?? 80),
    capacityBasis,
    overallocationLimit: Number(body.overallocationLimit ?? 120),
    workingHoursPerDay: Number(body.workingHoursPerDay ?? 8.5),
    workingDays: Array.isArray(body.workingDays)
      ? (body.workingDays as string[])
      : ["Mon", "Tue", "Wed", "Thu", "Fri"],
    companyOffDays,
  };
}

/** Field-level diff for Change History (FR-616). */
export function describeSettingsChanges(prev: SettingsSnapshot, next: SettingsSnapshot): string[] {
  const changes: string[] = [];

  if (prev.idleBelow !== next.idleBelow) {
    changes.push(`Idle below ${prev.idleBelow}% → ${next.idleBelow}%`);
  }
  if (prev.optimalTo !== next.optimalTo) {
    changes.push(`Optimal up to ${prev.optimalTo}% → ${next.optimalTo}%`);
  }
  if (prev.excellent !== next.excellent) {
    changes.push(`Excellent from ${prev.excellent}% → ${next.excellent}%`);
  }
  if (prev.good !== next.good) {
    changes.push(`Good from ${prev.good}% → ${next.good}%`);
  }
  if (prev.needsAttention !== next.needsAttention) {
    changes.push(`Needs attention from ${prev.needsAttention}% → ${next.needsAttention}%`);
  }
  if (prev.capacityBasis !== next.capacityBasis) {
    changes.push(`Capacity basis ${prev.capacityBasis} → ${next.capacityBasis}`);
  }
  if (prev.overallocationLimit !== next.overallocationLimit) {
    changes.push(`Overallocation limit ${prev.overallocationLimit}% → ${next.overallocationLimit}%`);
  }
  if (prev.workingHoursPerDay !== next.workingHoursPerDay) {
    changes.push(`Hours per day ${prev.workingHoursPerDay}h → ${next.workingHoursPerDay}h`);
  }
  if (prev.workingDays.join(",") !== next.workingDays.join(",")) {
    changes.push(`Working days ${prev.workingDays.join(", ")} → ${next.workingDays.join(", ")}`);
  }

  const prevOff = new Map(prev.companyOffDays.map((d) => [d.date, d.label]));
  const nextOff = new Map(next.companyOffDays.map((d) => [d.date, d.label]));
  for (const [date, label] of nextOff) {
    if (!prevOff.has(date)) changes.push(`Added off day: ${label} (${date})`);
  }
  for (const [date, label] of prevOff) {
    if (!nextOff.has(date)) changes.push(`Removed off day: ${label} (${date})`);
  }

  return changes;
}

@Injectable()
export class SettingsScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async syncCompanyOffDays(
    tx: Prisma.TransactionClient,
    incoming: { date: string; label: string }[]
  ) {
    const incomingDates = new Set(incoming.map((d) => dateKey(d.date)));
    const existing = await tx.companyOffDay.findMany({ where: { isDeleted: false } });
    const toRemove = existing.filter((d) => !incomingDates.has(dateKey(d.date)));
    if (toRemove.length) {
      await tx.companyOffDay.updateMany({
        where: { id: { in: toRemove.map((d) => d.id) } },
        data: { isDeleted: true, isActive: false, deletedAt: new Date() },
      });
    }
    for (const day of incoming) {
      const date = parseDate(day.date);
      await tx.companyOffDay.upsert({
        where: { date },
        create: { date, label: day.label },
        update: { label: day.label, isDeleted: false, isActive: true, deletedAt: null },
      });
    }
  }

  async writeAudit(
    tx: Prisma.TransactionClient,
    what: string,
    whoName: string,
    employeeId: bigint | null
  ) {
    await tx.appSettingsAudit.create({
      data: { what, whoName, employeeId },
    });
  }

  async supersedePending(tx: Prisma.TransactionClient, exceptId?: bigint) {
    await tx.appSettingsSchedule.updateMany({
      where: {
        status: SettingsScheduleStatus.pending,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { status: SettingsScheduleStatus.superseded },
    });
  }

  async applyPayload(
    tx: Prisma.TransactionClient,
    payload: SettingsPayload,
    modifiedBy: bigint | null
  ) {
    await tx.appSettings.update({
      where: { code: "default" },
      data: {
        idleBelow: payload.idleBelow,
        optimalTo: payload.optimalTo,
        excellent: payload.excellent,
        good: payload.good,
        needsAttention: payload.needsAttention,
        capacityBasis: payload.capacityBasis as CapacityBasis,
        overallocationLimit: payload.overallocationLimit,
        workingHoursPerDay: payload.workingHoursPerDay,
        workingDays: payload.workingDays,
        ...(modifiedBy != null ? { modifiedBy } : {}),
        version: { increment: 1 },
      },
    });
    await this.syncCompanyOffDays(tx, payload.companyOffDays);
  }

  /** Apply all due pending schedules (effective_date <= today UTC). Returns count applied. */
  async applyDueSchedules(actorName = "System"): Promise<number> {
    const today = todayUtcKey();
    const due = await this.prisma.appSettingsSchedule.findMany({
      where: {
        status: SettingsScheduleStatus.pending,
        effectiveDate: { lte: parseDate(today) },
      },
      orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
    });

    let applied = 0;
    for (const sched of due) {
      const payload = sched.payload as unknown as SettingsPayload;
      const effective = dateKey(sched.effectiveDate);
      try {
        await this.prisma.$transaction(async (tx) => {
          const row = await tx.appSettingsSchedule.findFirst({
            where: { id: sched.id, status: SettingsScheduleStatus.pending },
          });
          if (!row) return;

          await this.applyPayload(tx, payload, row.createdById);
          await tx.appSettingsSchedule.update({
            where: { id: row.id },
            data: {
              status: SettingsScheduleStatus.applied,
              appliedAt: new Date(),
            },
          });
          await this.writeAudit(
            tx,
            `Applied scheduled change: ${row.changeSummary}, effective ${formatEffectiveLabel(effective)}`,
            actorName,
            row.createdById
          );
        });
        applied += 1;
      } catch {
        /* leave pending for next attempt */
      }
    }
    return applied;
  }

  async listPending() {
    await this.applyDueSchedules();
    return this.prisma.appSettingsSchedule.findMany({
      where: { status: SettingsScheduleStatus.pending },
      orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
    });
  }

  async createSchedule(
    body: Record<string, unknown>,
    user: { sub: string; email: string }
  ) {
    const effectiveRaw = String(body.effectiveDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveRaw)) {
      throw new BadRequestException("effectiveDate must be YYYY-MM-DD");
    }
    const today = todayUtcKey();
    if (effectiveRaw <= today) {
      throw new BadRequestException("effectiveDate must be after today; use immediate save for today");
    }

    const beforeSettings = await this.prisma.appSettings.findFirstOrThrow({
      where: { code: "default", isDeleted: false },
    });
    const beforeOffDays = await this.prisma.companyOffDay.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: { date: "asc" },
    });
    const prev = snapshotFromDb(beforeSettings, beforeOffDays);
    const payload = payloadFromBody(body, prev.companyOffDays);
    const next: SettingsSnapshot = { ...payload };
    const changes = describeSettingsChanges(prev, next);
    if (changes.length === 0) {
      throw new BadRequestException("No settings changes to schedule");
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(user.sub), isDeleted: false },
      select: { id: true, name: true },
    });
    const whoName = employee?.name?.trim() || user.email || "Unknown user";
    const changeSummary = changes.join("; ");
    const effectiveLabel = formatEffectiveLabel(effectiveRaw);

    const schedule = await this.prisma.$transaction(async (tx) => {
      await this.supersedePending(tx);
      const created = await tx.appSettingsSchedule.create({
        data: {
          effectiveDate: parseDate(effectiveRaw),
          status: SettingsScheduleStatus.pending,
          payload,
          changeSummary,
          createdById: employee?.id ?? null,
        },
      });
      await this.writeAudit(
        tx,
        `Scheduled: ${changeSummary}, effective ${effectiveLabel}`,
        whoName,
        employee?.id ?? null
      );
      return created;
    });

    return schedule;
  }

  async cancelSchedule(id: string, user: { sub: string; email: string }) {
    if (!/^\d+$/.test(id)) throw new BadRequestException("Invalid schedule id");
    const scheduleId = BigInt(id);
    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(user.sub), isDeleted: false },
      select: { id: true, name: true },
    });
    const whoName = employee?.name?.trim() || user.email || "Unknown user";

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appSettingsSchedule.findFirst({
        where: { id: scheduleId, status: SettingsScheduleStatus.pending },
      });
      if (!row) throw new NotFoundException("Pending schedule not found");
      const cancelled = await tx.appSettingsSchedule.update({
        where: { id: row.id },
        data: {
          status: SettingsScheduleStatus.cancelled,
          cancelledAt: new Date(),
        },
      });
      await this.writeAudit(
        tx,
        `Cancelled scheduled change: ${row.changeSummary}, effective ${formatEffectiveLabel(dateKey(row.effectiveDate))}`,
        whoName,
        employee?.id ?? null
      );
      return cancelled;
    });
    return updated;
  }
}
