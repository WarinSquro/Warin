import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { assertCanPlanForEmployee } from "../auth/resource-scope";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function addUtcCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar date for Prisma DATE columns (avoid UTC day-shift in local TZ). */
function calendarDate(d: Date): string {
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

function overlapsRequestedRange(
  start: string,
  end: string,
  from: string,
  to: string
): boolean {
  return start <= to && end >= from;
}

type AllocBody = {
  employeeHrmsId: string;
  projectCode: string;
  milestoneId: string;
  activity: string;
  tasks?: string[];
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  reason?: string;
};

@ApiTags("allocations")
@ApiBearerAuth()
@Controller("allocations")
export class AllocationsController {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(a: {
    id: bigint;
    activityId: bigint;
    tasks: string[];
    startDate: Date;
    endDate: Date;
    hoursPerDay: number;
    reason: string;
    createdAt: Date;
    employee: { hrmsId: string; name: string };
    project: { projectCode: string; name: string };
    milestone: { id: bigint; name: string };
    activity: { id: bigint; name: string; code: string };
  }) {
    return {
      id: a.id.toString(),
      employeeHrmsId: a.employee.hrmsId,
      employeeName: a.employee.name,
      projectCode: a.project.projectCode,
      projectName: a.project.name,
      milestoneId: a.milestone.id.toString(),
      milestoneName: a.milestone.name,
      activityId: a.activity.id.toString(),
      activity: a.activity.name,
      tasks: a.tasks,
      startDate: calendarDate(a.startDate),
      endDate: calendarDate(a.endDate),
      hoursPerDay: Number(a.hoursPerDay),
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
    };
  }

  private include() {
    return {
      employee: { select: { hrmsId: true, name: true } },
      project: { select: { projectCode: true, name: true } },
      milestone: { select: { id: true, name: true } },
      activity: { select: { id: true, name: true, code: true } },
    } as const;
  }

  private async resolveRefs(body: AllocBody) {
    const employee = await this.prisma.employee.findFirst({
      where: { hrmsId: body.employeeHrmsId?.trim(), isDeleted: false },
    });
    if (!employee) throw new BadRequestException("Employee not found");

    const project = await this.prisma.project.findFirst({
      where: { projectCode: body.projectCode?.trim(), isDeleted: false },
    });
    if (!project) throw new BadRequestException("Project not found");

    if (!/^\d+$/.test(body.milestoneId)) {
      throw new BadRequestException("Invalid milestoneId");
    }
    const milestone = await this.prisma.projectMilestone.findFirst({
      where: {
        id: BigInt(body.milestoneId),
        projectId: project.id,
        isDeleted: false,
      },
    });
    if (!milestone) throw new BadRequestException("Milestone not found on project");

    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);
    if (!startDate || !endDate) {
      throw new BadRequestException("startDate and endDate are required");
    }
    if (endDate < startDate) {
      throw new BadRequestException("endDate must be on or after startDate");
    }

    const hoursPerDay = Number(body.hoursPerDay);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay < 0 || hoursPerDay > 24) {
      throw new BadRequestException("hoursPerDay must be between 0 and 24");
    }

    const activityRef = body.activity?.trim();
    if (!activityRef) throw new BadRequestException("activity is required");
    const activity = /^\d+$/.test(activityRef)
      ? await this.prisma.activity.findFirst({
          where: { id: BigInt(activityRef), isDeleted: false },
        })
      : await this.prisma.activity.findFirst({
          where: {
            isDeleted: false,
            OR: [{ name: activityRef }, { code: activityRef }],
          },
        });
    if (!activity) throw new BadRequestException(`Activity not found: ${activityRef}`);

    return {
      employee,
      project,
      milestone,
      startDate,
      endDate,
      hoursPerDay,
      activityId: activity.id,
      tasks: body.tasks ?? [],
      reason: body.reason?.trim() ?? "",
    };
  }

  @Get()
  @RequirePermissions(
    "planner",
    "availability",
    "utilization",
    "confirmations",
    "reports.deployment",
    "reports.performance",
    "reports.execution",
    "reports.daily_work"
  )
  async list(
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const fromDay = from?.slice(0, 10);
    const toDay = to?.slice(0, 10);
    // Widen Prisma DATE vs timestamptz comparison by 1 day so IST/UTC
    // session casts do not drop rows that end on `from` (e.g. Today).
    const fromDate = fromDay ? parseDate(addUtcCalendarDays(fromDay, -1)) : null;
    const toDate = toDay ? parseDate(addUtcCalendarDays(toDay, 1)) : null;

    const rows = await this.prisma.allocation.findMany({
      where: {
        isDeleted: false,
        ...(employeeHrmsId
          ? { employee: { hrmsId: employeeHrmsId, isDeleted: false } }
          : {}),
        ...(fromDate && toDate
          ? {
              startDate: { lte: toDate },
              endDate: { gte: fromDate },
            }
          : {}),
      },
      include: this.include(),
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    const mapped = rows.map((a) => this.mapRow(a));
    if (!fromDay || !toDay) return ser(mapped);
    return ser(
      mapped.filter((a) => overlapsRequestedRange(a.startDate, a.endDate, fromDay, toDay))
    );
  }

  @Get(":id")
  @RequirePermissions("planner", "confirmations")
  async one(@Param("id") id: string) {
    if (!/^\d+$/.test(id)) throw new NotFoundException("Allocation not found");
    const row = await this.prisma.allocation.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: this.include(),
    });
    if (!row) throw new NotFoundException("Allocation not found");
    return ser(this.mapRow(row));
  }

  @Post()
  @RequirePermissions("planner")
  @EmitDataChange("allocations", "create")
  async create(@Req() req: { user: JwtPayload }, @Body() body: AllocBody) {
    const refs = await this.resolveRefs(body);
    await assertCanPlanForEmployee(this.prisma, req.user, refs.employee);
    const created = await this.prisma.allocation.create({
      data: {
        employeeId: refs.employee.id,
        projectId: refs.project.id,
        milestoneId: refs.milestone.id,
        activityId: refs.activityId,
        tasks: refs.tasks,
        startDate: refs.startDate,
        endDate: refs.endDate,
        hoursPerDay: refs.hoursPerDay,
        reason: refs.reason,
      },
      include: this.include(),
    });
    return ser(this.mapRow(created));
  }

  @Put(":id")
  @RequirePermissions("planner")
  @EmitDataChange("allocations", "update")
  async update(@Req() req: { user: JwtPayload }, @Param("id") id: string, @Body() body: AllocBody) {
    if (!/^\d+$/.test(id)) throw new NotFoundException("Allocation not found");
    const existing = await this.prisma.allocation.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: { employee: { select: { id: true, resourceOwnerId: true, hrmsId: true } } },
    });
    if (!existing) throw new NotFoundException("Allocation not found");
    await assertCanPlanForEmployee(this.prisma, req.user, existing.employee);

    const refs = await this.resolveRefs(body);
    await assertCanPlanForEmployee(this.prisma, req.user, refs.employee);
    const updated = await this.prisma.allocation.update({
      where: { id: existing.id },
      data: {
        employeeId: refs.employee.id,
        projectId: refs.project.id,
        milestoneId: refs.milestone.id,
        activityId: refs.activityId,
        tasks: refs.tasks,
        startDate: refs.startDate,
        endDate: refs.endDate,
        hoursPerDay: refs.hoursPerDay,
        reason: refs.reason,
        version: { increment: 1 },
      },
      include: this.include(),
    });
    return ser(this.mapRow(updated));
  }

  @Delete(":id")
  @RequirePermissions("planner")
  @EmitDataChange("allocations", "delete")
  async remove(@Req() req: { user: JwtPayload }, @Param("id") id: string) {
    if (!/^\d+$/.test(id)) throw new NotFoundException("Allocation not found");
    const existing = await this.prisma.allocation.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: { employee: { select: { id: true, resourceOwnerId: true, hrmsId: true } } },
    });
    if (!existing) throw new NotFoundException("Allocation not found");
    await assertCanPlanForEmployee(this.prisma, req.user, existing.employee);

    const startIso = calendarDate(existing.startDate);
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.APP_DISPLAY_TIMEZONE || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (startIso <= todayIso) {
      throw new BadRequestException(
        "Past and current allocations cannot be deleted — adjust hours instead."
      );
    }

    await this.prisma.allocation.update({
      where: { id: existing.id },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return { ok: true };
  }
}
