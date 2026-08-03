import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";
import type { JwtPayload } from "../auth/jwt.strategy";
import {
  dateKey,
  describeSettingsChanges,
  formatEffectiveLabel,
  payloadFromBody,
  SettingsScheduleService,
  snapshotFromDb,
} from "./settings-schedule.service";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function mapSchedule(row: {
  id: bigint;
  effectiveDate: Date;
  status: string;
  changeSummary: string;
  payload: unknown;
  createdAt: Date;
  appliedAt: Date | null;
  cancelledAt: Date | null;
  createdById: bigint | null;
}) {
  const effectiveDate = dateKey(row.effectiveDate);
  return {
    id: row.id.toString(),
    effectiveDate,
    effectiveLabel: formatEffectiveLabel(effectiveDate),
    status: row.status,
    changeSummary: row.changeSummary,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdById: row.createdById?.toString() ?? null,
  };
}

const AUDIT_LIST_LIMIT = 100;

@ApiTags("settings")
@ApiBearerAuth()
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SettingsScheduleService
  ) {}

  @Get()
  @RequirePermissions("settings")
  async get() {
    await this.schedules.applyDueSchedules();
    const settings = await this.prisma.appSettings.findFirst({ where: { code: "default", isDeleted: false } });
    const offDays = await this.prisma.companyOffDay.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: { date: "asc" },
    });
    return ser({ settings, companyOffDays: offDays });
  }

  @Get("audit")
  @RequirePermissions("settings")
  async listAudit(@Query("limit") limitRaw?: string) {
    const limit = Math.min(
      AUDIT_LIST_LIMIT,
      Math.max(1, Number.parseInt(limitRaw ?? String(AUDIT_LIST_LIMIT), 10) || AUDIT_LIST_LIMIT)
    );
    const entries = await this.prisma.appSettingsAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ser({
      entries: entries.map((e) => ({
        id: e.id.toString(),
        who: e.whoName,
        what: e.what,
        createdAt: e.createdAt.toISOString(),
        employeeId: e.employeeId?.toString() ?? null,
      })),
    });
  }

  /** Pending schedules — any authenticated user (Utilization banner). */
  @Get("schedule")
  async listSchedule() {
    const pending = await this.schedules.listPending();
    return ser({ schedules: pending.map(mapSchedule) });
  }

  @Post("schedule")
  @RequirePermissions("settings")
  async createSchedule(@Req() req: { user: JwtPayload }, @Body() body: Record<string, unknown>) {
    const schedule = await this.schedules.createSchedule(body, req.user);
    return ser({ schedule: mapSchedule(schedule) });
  }

  @Post("schedule/apply-due")
  @RequirePermissions("settings")
  async applyDue() {
    const applied = await this.schedules.applyDueSchedules("System");
    return { applied };
  }

  @Delete("schedule/:id")
  @RequirePermissions("settings")
  async cancelSchedule(@Req() req: { user: JwtPayload }, @Param("id") id: string) {
    const schedule = await this.schedules.cancelSchedule(id, req.user);
    return ser({ schedule: mapSchedule(schedule) });
  }

  @Put()
  @RequirePermissions("settings")
  async put(@Req() req: { user: JwtPayload }, @Body() body: Record<string, unknown>) {
    await this.schedules.applyDueSchedules();

    const beforeSettings = await this.prisma.appSettings.findFirstOrThrow({
      where: { code: "default", isDeleted: false },
    });
    const beforeOffDays = await this.prisma.companyOffDay.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: { date: "asc" },
    });
    const prev = snapshotFromDb(beforeSettings, beforeOffDays);
    const payload = payloadFromBody(body, prev.companyOffDays);

    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
      select: { id: true, name: true },
    });
    const whoName = employee?.name?.trim() || req.user.email || "Unknown user";

    const result = await this.prisma.$transaction(async (tx) => {
      await this.schedules.supersedePending(tx);
      await this.schedules.applyPayload(tx, payload, BigInt(req.user.sub));
      const settings = await tx.appSettings.findFirstOrThrow({
        where: { code: "default", isDeleted: false },
      });
      const offDays = await tx.companyOffDay.findMany({
        where: { isDeleted: false, isActive: true },
        orderBy: { date: "asc" },
      });
      const next = snapshotFromDb(settings, offDays);
      const changes = describeSettingsChanges(prev, next);
      if (changes.length > 0) {
        await this.schedules.writeAudit(tx, changes.join("; "), whoName, employee?.id ?? null);
      }
      return { settings, companyOffDays: offDays };
    });

    return ser(result);
  }
}
