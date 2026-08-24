import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  ResourceLeaveClassification,
  ResourceLeaveStatus,
  ResourceLeaveType,
} from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";
import type { JwtPayload } from "../auth/jwt.strategy";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";
import {
  assertCanMutateLeaveEmployee,
  assertCanViewLeaveEmployee,
  isoDate,
  mutableEmployeeIds,
  parseLeaveDate,
  todayIsoInAppTz,
  viewableEmployeeIds,
} from "./resource-leave-scope";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function actorPk(user?: JwtPayload): bigint | null {
  if (!user?.sub || !/^\d+$/.test(user.sub)) return null;
  return BigInt(user.sub);
}

type CreateBody = {
  employeeHrmsId: string;
  leaveDate: string;
  leaveType: "planned" | "unplanned";
  reason: string;
};

type PatchReasonBody = { reason: string };

@ApiTags("resource-leaves")
@ApiBearerAuth()
@Controller("resource-leaves")
export class ResourceLeavesController {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: {
    id: bigint;
    leaveDate: Date;
    leaveType: ResourceLeaveType;
    classification: ResourceLeaveClassification;
    reason: string;
    impactedPlannedHours: number;
    status: ResourceLeaveStatus;
    enteredAt: Date;
    employee: { hrmsId: string; name: string; department: { name: string } | null };
    enteredBy: { name: string };
  }) {
    return {
      id: row.id.toString(),
      leaveDate: isoDate(row.leaveDate),
      employeeHrmsId: row.employee.hrmsId,
      employeeName: row.employee.name,
      department: row.employee.department?.name ?? "—",
      leaveType: row.leaveType === "planned" ? "Planned" : "Unplanned",
      classification: row.classification === "negative" ? "Negative" : "Zero",
      reason: row.reason,
      enteredBy: row.enteredBy.name,
      enteredAt: row.enteredAt.toISOString(),
      impactedPlannedHours: row.impactedPlannedHours,
      status: row.status === "active" ? "Active" : "Cancelled",
      canMutate: true,
    };
  }

  @Get()
  @RequirePermissions("planner")
  async list(
    @Req() req: { user: JwtPayload },
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const viewScope = await viewableEmployeeIds(this.prisma, req.user);
    const mutateSet = new Set(
      (await mutableEmployeeIds(this.prisma, req.user)).map((id) => id.toString())
    );
    const selfPk = actorPk(req.user);

    const whereEmp =
      viewScope === "all"
        ? { isDeleted: false, isActive: true }
        : { id: { in: viewScope }, isDeleted: false, isActive: true };

    if (viewScope !== "all" && viewScope.length === 0) {
      return ser({ leaves: [] as unknown[] });
    }

    const fromDate = from ? parseLeaveDate(from) : null;
    const toDate = to ? parseLeaveDate(to) : null;

    const rows = await this.prisma.resourceLeave.findMany({
      where: {
        isDeleted: false,
        employee: whereEmp,
        ...(fromDate || toDate
          ? {
              leaveDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      include: {
        employee: { select: { hrmsId: true, name: true, department: { select: { name: true } } } },
        enteredBy: { select: { name: true } },
      },
      orderBy: [{ leaveDate: "desc" }, { id: "desc" }],
    });

    return ser({
      leaves: rows.map((r) => ({
        ...this.mapRow(r),
        canMutate: mutateSet.has(r.employeeId.toString()),
      })),
      viewerHrmsId: req.user.hrmsId,
      selfEmployeeId: selfPk?.toString() ?? null,
    });
  }

  /** Active leave dates for planner markers / allocation blocks. */
  @Get("active-dates")
  @RequirePermissions("planner")
  async activeDates(@Req() req: { user: JwtPayload }) {
    const viewScope = await viewableEmployeeIds(this.prisma, req.user);
    const whereEmp =
      viewScope === "all"
        ? { isDeleted: false, isActive: true }
        : { id: { in: viewScope }, isDeleted: false, isActive: true };

    const rows = await this.prisma.resourceLeave.findMany({
      where: {
        isDeleted: false,
        status: "active",
        employee: whereEmp,
      },
      select: {
        leaveDate: true,
        employee: { select: { hrmsId: true } },
      },
    });

    const byEmployee: Record<string, string[]> = {};
    for (const r of rows) {
      const key = r.employee.hrmsId;
      const iso = isoDate(r.leaveDate);
      if (!byEmployee[key]) byEmployee[key] = [];
      if (!byEmployee[key].includes(iso)) byEmployee[key].push(iso);
    }
    return ser({ byEmployee });
  }

  @Post()
  @RequirePermissions("planner")
  @EmitDataChange("allocations", "update")
  async create(@Req() req: { user: JwtPayload }, @Body() body: CreateBody) {
    const employee = await this.prisma.employee.findFirst({
      where: { hrmsId: body.employeeHrmsId?.trim(), isDeleted: false, isActive: true },
      select: { id: true, hrmsId: true },
    });
    if (!employee) throw new NotFoundException("Employee not found");

    await assertCanMutateLeaveEmployee(this.prisma, req.user, employee.id);

    const leaveDate = parseLeaveDate(body.leaveDate);
    if (!leaveDate) throw new BadRequestException("Leave date is required");

    const leaveIso = isoDate(leaveDate);
    const todayIso = todayIsoInAppTz();
    if (leaveIso < todayIso) {
      throw new BadRequestException("Backdated leave entry is not allowed");
    }

    const leaveType = body.leaveType === "unplanned" ? "unplanned" : "planned";
    const reason = String(body.reason ?? "").trim();
    if (!reason) throw new BadRequestException("Reason is required");
    if (reason.length > 30) throw new BadRequestException("Reason must be at most 30 characters");

    const existingActive = await this.prisma.resourceLeave.findFirst({
      where: {
        employeeId: employee.id,
        leaveDate,
        status: "active",
        isDeleted: false,
      },
    });
    if (existingActive) {
      throw new BadRequestException("An active leave already exists for this resource on that date");
    }

    if (leaveIso === todayIso) {
      const prod = await this.prisma.confirmationProductivityDay.findUnique({
        where: {
          employeeId_workDate: { employeeId: employee.id, workDate: leaveDate },
        },
        select: { dayStartAt: true, isDeleted: true },
      });
      if (prod && !prod.isDeleted && prod.dayStartAt) {
        throw new BadRequestException(
          "Leave cannot be entered because Day Start is already recorded for this resource."
        );
      }
    }

    const overlapping = await this.prisma.allocation.findMany({
      where: {
        employeeId: employee.id,
        isDeleted: false,
        startDate: { lte: leaveDate },
        endDate: { gte: leaveDate },
      },
      select: { id: true, hoursPerDay: true },
    });

    const impactedPlannedHours = overlapping.reduce((s, a) => s + (Number(a.hoursPerDay) || 0), 0);
    const classification: ResourceLeaveClassification =
      impactedPlannedHours > 0 ? "negative" : "zero";

    const actor = actorPk(req.user);
    const now = new Date();

    const saved = await this.prisma.$transaction(async (tx) => {
      if (overlapping.length > 0) {
        await tx.allocation.updateMany({
          where: { id: { in: overlapping.map((a) => a.id) } },
          data: {
            isDeleted: true,
            isActive: false,
            deletedAt: now,
            version: { increment: 1 },
          },
        });
      }

      return tx.resourceLeave.create({
        data: {
          employeeId: employee.id,
          leaveDate,
          leaveType,
          classification,
          reason,
          impactedPlannedHours,
          status: "active",
          enteredByEmployeeId: actor ?? employee.id,
          enteredAt: now,
          createdBy: actor,
          modifiedBy: actor,
        },
        include: {
          employee: { select: { hrmsId: true, name: true, department: { select: { name: true } } } },
          enteredBy: { select: { name: true } },
        },
      });
    });

    return ser({ leave: this.mapRow(saved) });
  }

  @Patch(":id/reason")
  @RequirePermissions("planner")
  async patchReason(
    @Req() req: { user: JwtPayload },
    @Param("id") id: string,
    @Body() body: PatchReasonBody
  ) {
    if (!/^\d+$/.test(id)) throw new NotFoundException("Leave not found");
    const row = await this.prisma.resourceLeave.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: {
        employee: { select: { hrmsId: true, name: true, department: { select: { name: true } } } },
        enteredBy: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException("Leave not found");
    if (row.status !== "active") {
      throw new BadRequestException("Only active leave reason can be edited");
    }

    await assertCanMutateLeaveEmployee(this.prisma, req.user, row.employeeId);

    const reason = String(body.reason ?? "").trim();
    if (!reason) throw new BadRequestException("Reason is required");
    if (reason.length > 30) throw new BadRequestException("Reason must be at most 30 characters");

    const actor = actorPk(req.user);
    const updated = await this.prisma.resourceLeave.update({
      where: { id: row.id },
      data: { reason, modifiedBy: actor, version: { increment: 1 } },
      include: {
        employee: { select: { hrmsId: true, name: true, department: { select: { name: true } } } },
        enteredBy: { select: { name: true } },
      },
    });

    return ser({ leave: this.mapRow(updated) });
  }

  @Post(":id/cancel")
  @RequirePermissions("planner")
  @EmitDataChange("allocations", "update")
  async cancel(@Req() req: { user: JwtPayload }, @Param("id") id: string) {
    if (!/^\d+$/.test(id)) throw new NotFoundException("Leave not found");
    const row = await this.prisma.resourceLeave.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: {
        employee: { select: { hrmsId: true, name: true, department: { select: { name: true } } } },
        enteredBy: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException("Leave not found");
    if (row.status !== "active") {
      throw new BadRequestException("Leave is already cancelled");
    }

    await assertCanMutateLeaveEmployee(this.prisma, req.user, row.employeeId);

    const actor = actorPk(req.user);
    const now = new Date();
    const updated = await this.prisma.resourceLeave.update({
      where: { id: row.id },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: actor,
        modifiedBy: actor,
        version: { increment: 1 },
      },
      include: {
        employee: { select: { hrmsId: true, name: true, department: { select: { name: true } } } },
        enteredBy: { select: { name: true } },
      },
    });

    return ser({ leave: this.mapRow(updated) });
  }

  /** Check whether allocation is blocked for employee+date (used by allocation create). */
  @Get("check")
  @RequirePermissions("planner")
  async check(
    @Req() req: { user: JwtPayload },
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("date") date?: string
  ) {
    if (!employeeHrmsId || !date) {
      return { blocked: false };
    }
    const employee = await this.prisma.employee.findFirst({
      where: { hrmsId: employeeHrmsId.trim(), isDeleted: false },
      select: { id: true },
    });
    if (!employee) return { blocked: false };

    await assertCanViewLeaveEmployee(this.prisma, req.user, employee.id);

    const leaveDate = parseLeaveDate(date);
    if (!leaveDate) return { blocked: false };

    const active = await this.prisma.resourceLeave.findFirst({
      where: {
        employeeId: employee.id,
        leaveDate,
        status: "active",
        isDeleted: false,
      },
    });

    return {
      blocked: Boolean(active),
      message: active
        ? "This resource is on leave for the selected date. Cancel the leave to allocate work."
        : undefined,
    };
  }
}
