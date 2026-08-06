import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CapacityBasis,
  PrismaClient,
  SettingsScheduleStatus,
} from "@prisma/client";

type SettingsPayload = {
  idleBelow: number;
  optimalTo: number;
  excellent: number;
  good: number;
  needsAttention: number;
  capacityBasis: "billable" | "total";
  overallocationLimit: number;
  workingHoursPerDay: number;
  workingDays: string[];
  dateFormat?: string;
  companyOffDays: { date: string; label: string }[];
};

function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function dateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatEffectiveLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Applies due Settings schedules (FR-033). Runs periodically in the worker. */
@Injectable()
export class SettingsScheduleApplyService implements OnModuleInit {
  private readonly logger = new Logger(SettingsScheduleApplyService.name);
  private readonly prisma = new PrismaClient();

  onModuleInit() {
    void this.tick();
    setInterval(() => {
      void this.tick();
    }, 60_000);
    this.logger.log("Settings schedule apply job every 60s");
  }

  private async tick() {
    try {
      const n = await this.applyDue();
      if (n > 0) this.logger.log(`Applied ${n} due settings schedule(s)`);
    } catch (err) {
      this.logger.error(
        `Settings schedule apply failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async applyDue(): Promise<number> {
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
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.appSettingsSchedule.findFirst({
          where: { id: sched.id, status: SettingsScheduleStatus.pending },
        });
        if (!row) return;

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
            ...(payload.dateFormat ? { dateFormat: payload.dateFormat } : {}),
            ...(row.createdById != null ? { modifiedBy: row.createdById } : {}),
            version: { increment: 1 },
          },
        });

        const incomingDates = new Set(payload.companyOffDays.map((d) => dateKey(d.date)));
        const existing = await tx.companyOffDay.findMany({ where: { isDeleted: false } });
        const toRemove = existing.filter((d) => !incomingDates.has(dateKey(d.date)));
        if (toRemove.length) {
          await tx.companyOffDay.updateMany({
            where: { id: { in: toRemove.map((d) => d.id) } },
            data: { isDeleted: true, isActive: false, deletedAt: new Date() },
          });
        }
        for (const day of payload.companyOffDays) {
          const date = parseDate(day.date);
          await tx.companyOffDay.upsert({
            where: { date },
            create: { date, label: day.label },
            update: { label: day.label, isDeleted: false, isActive: true, deletedAt: null },
          });
        }

        await tx.appSettingsSchedule.update({
          where: { id: row.id },
          data: { status: SettingsScheduleStatus.applied, appliedAt: new Date() },
        });
        await tx.appSettingsAudit.create({
          data: {
            what: `Applied scheduled change: ${row.changeSummary}, effective ${formatEffectiveLabel(effective)}`,
            whoName: "System",
            employeeId: row.createdById,
          },
        });
      });
      applied += 1;
    }
    return applied;
  }
}
