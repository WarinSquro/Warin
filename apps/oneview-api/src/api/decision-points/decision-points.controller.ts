import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type {
  DecisionPointActionType,
  DecisionPointStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { descendantEmployeeIds } from "../auth/resource-owner-tree";
import { RequirePermissions } from "../auth/guards";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";

function ser<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
  ) as T;
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function todayLocalISO(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const day = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const OPEN_STATUSES: DecisionPointStatus[] = [
  "pending_ro_action",
  "escalated_pending_next_ro",
];

const CLOSE_ACTIONS: Record<
  "acknowledged_close" | "approved_close" | "rejected_close" | "self_resolved",
  DecisionPointStatus
> = {
  acknowledged_close: "acknowledged_closed",
  approved_close: "approved_closed",
  rejected_close: "rejected_closed",
  self_resolved: "self_resolved_closed",
};

const pointInclude = {
  type: true,
  raisedBy: { select: { id: true, hrmsId: true, name: true } },
  currentOwner: { select: { id: true, hrmsId: true, name: true } },
  immediateOwner: { select: { id: true, hrmsId: true, name: true } },
  previousOwner: { select: { id: true, hrmsId: true, name: true } },
  finalActor: { select: { id: true, hrmsId: true, name: true } },
  allocation: {
    include: {
      project: { select: { id: true, projectCode: true, name: true } },
      activity: { select: { id: true, name: true } },
      employee: { select: { id: true, hrmsId: true, name: true } },
    },
  },
  actions: {
    orderBy: { createdAt: "asc" as const },
    include: {
      performedBy: { select: { id: true, hrmsId: true, name: true } },
      previousOwner: { select: { id: true, hrmsId: true, name: true } },
      nextOwner: { select: { id: true, hrmsId: true, name: true } },
    },
  },
} satisfies Prisma.DecisionPointInclude;

@ApiTags("decision-points")
@ApiBearerAuth()
@Controller("decision-points")
export class DecisionPointsController {
  constructor(private readonly prisma: PrismaService) {}

  private async requireActor(user: JwtPayload) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: BigInt(user.sub), isDeleted: false },
    });
    if (!emp) throw new ForbiddenException("Employee not found");
    return emp;
  }

  /** Direct + indirect reports (excludes the owner). */
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

  private async nextPointCode(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const name = `decision_point_${year}`;
    await tx.idSequence.upsert({
      where: { name },
      create: { name, nextValue: 1n },
      update: {},
    });
    const updated = await tx.idSequence.update({
      where: { name },
      data: { nextValue: { increment: 1 } },
    });
    const seq = Number(updated.nextValue - 1n);
    return `DP-${year}-${String(seq).padStart(5, "0")}`;
  }

  private mapListRow(
    row: Prisma.DecisionPointGetPayload<{ include: typeof pointInclude }>,
    view: "mine" | "requiring"
  ) {
    const workRef = row.allocation
      ? `${row.allocation.project.name} · ${row.allocation.activity.name}`
      : null;
    const base = {
      id: row.id.toString(),
      pointCode: row.pointCode,
      subject: row.subject,
      status: row.status,
      typeName: row.type.name,
      typeCode: row.type.code,
      raisedAt: row.createdAt.toISOString(),
      raisedDate: isoDate(row.createdAt),
      lastActionAt: row.lastActionAt?.toISOString() ?? null,
      lastActionDate: isoDate(row.lastActionAt),
      workReference: workRef,
      projectName: row.allocation?.project.name ?? null,
      escalationLevel: row.escalationLevel,
      currentWithName: row.currentOwner?.name ?? null,
      finalDecisionByName: row.finalActor?.name ?? null,
    };
    if (view === "mine") {
      return base;
    }
    return {
      ...base,
      raisedByName: row.raisedBy.name,
      previousOwnerName: row.previousOwner?.name ?? null,
      pendingSince: isoDate(row.lastActionAt ?? row.createdAt),
    };
  }

  private mapDetail(
    row: Prisma.DecisionPointGetPayload<{ include: typeof pointInclude }>,
    actorId: bigint
  ) {
    const isRaiser = row.raisedById === actorId;
    const isCurrentOwner = row.currentOwnerId === actorId;
    const open = OPEN_STATUSES.includes(row.status);
    const onlyRaised =
      row.actions.length === 1 && row.actions[0]?.actionType === "raised";
    const canSelfResolve =
      isRaiser && open && row.status === "pending_ro_action" && onlyRaised;
    const canActAsRo = isCurrentOwner && open;
    // Escalate availability checked by caller with actor.resourceOwnerId
    return {
      id: row.id.toString(),
      pointCode: row.pointCode,
      subject: row.subject,
      remarks: row.remarks,
      status: row.status,
      escalationLevel: row.escalationLevel,
      raisedAt: row.createdAt.toISOString(),
      raisedDate: isoDate(row.createdAt),
      lastActionAt: row.lastActionAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      type: {
        id: row.type.id.toString(),
        code: row.type.code,
        name: row.type.name,
        description: row.type.description,
        allocationRequirement: row.type.allocationRequirement,
      },
      raisedBy: {
        id: row.raisedBy.id.toString(),
        name: row.raisedBy.name,
        hrmsId: row.raisedBy.hrmsId,
      },
      currentOwner: row.currentOwner
        ? {
            id: row.currentOwner.id.toString(),
            name: row.currentOwner.name,
            hrmsId: row.currentOwner.hrmsId,
          }
        : null,
      previousOwner: row.previousOwner
        ? {
            id: row.previousOwner.id.toString(),
            name: row.previousOwner.name,
            hrmsId: row.previousOwner.hrmsId,
          }
        : null,
      finalActor: row.finalActor
        ? {
            id: row.finalActor.id.toString(),
            name: row.finalActor.name,
            hrmsId: row.finalActor.hrmsId,
          }
        : null,
      workContext: row.allocation
        ? {
            allocationId: row.allocation.id.toString(),
            projectName: row.allocation.project.name,
            projectCode: row.allocation.project.projectCode,
            activityName: row.allocation.activity.name,
            plannedHours: row.allocation.hoursPerDay,
            resourceName: row.allocation.employee.name,
            startDate: isoDate(row.allocation.startDate),
            endDate: isoDate(row.allocation.endDate),
          }
        : null,
      trail: row.actions.map((a) => ({
        id: a.id.toString(),
        actionType: a.actionType,
        remarks: a.remarks,
        previousStatus: a.previousStatus,
        newStatus: a.newStatus,
        createdAt: a.createdAt.toISOString(),
        performedByName: a.performedBy.name,
        previousOwnerName: a.previousOwner?.name ?? null,
        nextOwnerName: a.nextOwner?.name ?? null,
      })),
      permissions: {
        canSelfResolve,
        canActAsRo,
        isRaiser,
        isCurrentOwner,
      },
    };
  }

  /** Counts for tab badges — must be registered before :id */
  @Get()
  @RequirePermissions("my_team.decision_points")
  async summary(
    @Req() req: { user: JwtPayload },
    @Query("summary") summary?: string
  ) {
    if (summary !== "1") {
      throw new BadRequestException("Use /decision-points/mine or /requiring-action");
    }
    const actor = await this.requireActor(req.user);
    const [mine, requiring] = await Promise.all([
      this.prisma.decisionPoint.count({
        where: { raisedById: actor.id, isDeleted: false },
      }),
      this.prisma.decisionPoint.count({
        where: {
          currentOwnerId: actor.id,
          isDeleted: false,
          status: { in: OPEN_STATUSES },
        },
      }),
    ]);
    return { mine, requiring };
  }

  @Get("raise-options")
  @RequirePermissions("my_team.decision_points")
  async raiseOptions(@Req() req: { user: JwtPayload }) {
    const actor = await this.requireActor(req.user);
    const today = todayLocalISO();
    const day = new Date(`${today}T00:00:00.000Z`);

    const [types, allocations] = await Promise.all([
      this.prisma.decisionPointType.findMany({
        where: { isDeleted: false, isActive: true, status: "active" },
        orderBy: { name: "asc" },
      }),
      this.prisma.allocation.findMany({
        where: {
          employeeId: actor.id,
          isDeleted: false,
          isActive: true,
          startDate: { lte: day },
          endDate: { gte: day },
          project: { isDeleted: false, isActive: true },
        },
        include: {
          project: { select: { projectCode: true, name: true } },
          activity: { select: { name: true } },
        },
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
      }),
    ]);

    return ser({
      types: types.map((t) => ({
        id: t.id.toString(),
        code: t.code,
        name: t.name,
        description: t.description,
        allocationRequirement: t.allocationRequirement,
      })),
      allocations: allocations.map((a) => ({
        id: a.id.toString(),
        label: `${a.project.name} · ${a.activity.name} · ${a.hoursPerDay}h`,
        projectName: a.project.name,
        activityName: a.activity.name,
        hoursPerDay: a.hoursPerDay,
        startDate: isoDate(a.startDate),
        endDate: isoDate(a.endDate),
      })),
      hasResourceOwner: actor.resourceOwnerId != null,
    });
  }

  @Get("mine")
  @RequirePermissions("my_team.decision_points")
  async mine(@Req() req: { user: JwtPayload }) {
    const actor = await this.requireActor(req.user);
    const rows = await this.prisma.decisionPoint.findMany({
      where: { raisedById: actor.id, isDeleted: false },
      include: pointInclude,
      orderBy: { createdAt: "desc" },
    });
    return ser(rows.map((r) => this.mapListRow(r, "mine")));
  }

  @Get("team")
  @RequirePermissions("my_team.decision_points")
  async team(@Req() req: { user: JwtPayload }) {
    const actor = await this.requireActor(req.user);
    const reportIds = await this.reportSubtreeIds(actor.id);
    if (reportIds.length === 0) return [];
    const rows = await this.prisma.decisionPoint.findMany({
      where: { raisedById: { in: reportIds }, isDeleted: false },
      include: pointInclude,
      orderBy: { createdAt: "desc" },
    });
    return ser(rows.map((r) => this.mapListRow(r, "requiring")));
  }

  @Get("requiring-action")
  @RequirePermissions("my_team.decision_points")
  async requiringAction(@Req() req: { user: JwtPayload }) {
    const actor = await this.requireActor(req.user);
    const rows = await this.prisma.decisionPoint.findMany({
      where: {
        currentOwnerId: actor.id,
        isDeleted: false,
        status: { in: OPEN_STATUSES },
      },
      include: pointInclude,
      orderBy: { createdAt: "asc" },
    });
    return ser(rows.map((r) => this.mapListRow(r, "requiring")));
  }

  @Get(":id")
  @RequirePermissions("my_team.decision_points")
  async detail(@Req() req: { user: JwtPayload }, @Param("id") id: string) {
    const actor = await this.requireActor(req.user);
    if (!/^\d+$/.test(id.trim())) {
      throw new NotFoundException("Decision Point not found");
    }
    const row = await this.prisma.decisionPoint.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: pointInclude,
    });
    if (!row) throw new NotFoundException("Decision Point not found");

    const reportIds = await this.reportSubtreeIds(actor.id);
    const raisedByReport = reportIds.some((id) => id === row.raisedById);
    const allowed =
      req.user.isSuperAdmin ||
      row.raisedById === actor.id ||
      row.currentOwnerId === actor.id ||
      raisedByReport ||
      row.actions.some((a) => a.performedById === actor.id);
    if (!allowed) throw new ForbiddenException("Not allowed to view this Decision Point");

    const detail = this.mapDetail(row, actor.id);
    return ser({
      ...detail,
      permissions: {
        ...detail.permissions,
        canEscalate: detail.permissions.canActAsRo && actor.resourceOwnerId != null,
      },
    });
  }

  @Post()
  @RequirePermissions("my_team.decision_points")
  @EmitDataChange("decision-points", "create")
  async raise(
    @Req() req: { user: JwtPayload },
    @Body()
    body: {
      typeId?: string;
      subject?: string;
      remarks?: string;
      allocationId?: string | null;
    }
  ) {
    const actor = await this.requireActor(req.user);
    if (actor.status !== "active" || !actor.isActive) {
      throw new BadRequestException("Only active resources may raise a Point");
    }
    if (!actor.resourceOwnerId) {
      throw new BadRequestException(
        "You have no Resource Owner assigned. A Point cannot be raised."
      );
    }

    const typeId = body.typeId?.trim();
    const subject = body.subject?.trim();
    const remarks = body.remarks?.trim();
    if (!typeId) throw new BadRequestException("Point Type is required");
    if (!subject) throw new BadRequestException("Subject is required");
    if (!remarks) throw new BadRequestException("Remarks / Comments are required");

    const type = await this.prisma.decisionPointType.findFirst({
      where: { id: BigInt(typeId), isDeleted: false, isActive: true, status: "active" },
    });
    if (!type) throw new BadRequestException("Point Type is not available");

    let allocationId: bigint | null = null;
    if (body.allocationId) {
      const alloc = await this.prisma.allocation.findFirst({
        where: {
          id: BigInt(body.allocationId),
          employeeId: actor.id,
          isDeleted: false,
          isActive: true,
        },
      });
      if (!alloc) throw new BadRequestException("Work allocation not found for you");
      allocationId = alloc.id;
    } else if (type.allocationRequirement === "required") {
      throw new BadRequestException("Work allocation is required for this Point Type");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const pointCode = await this.nextPointCode(tx);
      const now = new Date();
      const point = await tx.decisionPoint.create({
        data: {
          pointCode,
          typeId: type.id,
          subject,
          remarks,
          status: "pending_ro_action",
          raisedById: actor.id,
          currentOwnerId: actor.resourceOwnerId!,
          immediateOwnerId: actor.resourceOwnerId!,
          allocationId,
          escalationLevel: 0,
          lastActionAt: now,
          createdBy: actor.id,
          modifiedBy: actor.id,
        },
      });
      await tx.decisionPointAction.create({
        data: {
          decisionPointId: point.id,
          actionType: "raised",
          performedById: actor.id,
          remarks,
          previousStatus: "pending_ro_action",
          newStatus: "pending_ro_action",
          previousOwnerId: null,
          nextOwnerId: actor.resourceOwnerId!,
        },
      });
      return tx.decisionPoint.findFirstOrThrow({
        where: { id: point.id },
        include: pointInclude,
      });
    });

    return ser(this.mapDetail(created, actor.id));
  }

  @Post(":id/actions")
  @RequirePermissions("my_team.decision_points")
  @EmitDataChange("decision-points", "update")
  async act(
    @Req() req: { user: JwtPayload },
    @Param("id") id: string,
    @Body()
    body: {
      action?: DecisionPointActionType;
      remarks?: string;
    }
  ) {
    const actor = await this.requireActor(req.user);
    const remarks = body.remarks?.trim();
    if (!remarks) throw new BadRequestException("Remarks / Comments are required");

    const action = body.action;
    if (
      action !== "acknowledged_close" &&
      action !== "approved_close" &&
      action !== "rejected_close" &&
      action !== "recommend_escalate" &&
      action !== "self_resolved"
    ) {
      throw new BadRequestException("Invalid action");
    }

    const point = await this.prisma.decisionPoint.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: { actions: { orderBy: { createdAt: "asc" } } },
    });
    if (!point) throw new NotFoundException("Decision Point not found");
    if (!OPEN_STATUSES.includes(point.status)) {
      throw new BadRequestException("Closed Points cannot be acted upon");
    }

    if (action === "self_resolved") {
      const onlyRaised =
        point.actions.length === 1 && point.actions[0]?.actionType === "raised";
      if (
        point.raisedById !== actor.id ||
        point.status !== "pending_ro_action" ||
        !onlyRaised
      ) {
        throw new BadRequestException(
          "Self-Resolve is only available before the first Resource Owner action"
        );
      }
    } else {
      if (point.currentOwnerId !== actor.id) {
        throw new ForbiddenException("Only the current Resource Owner may take this action");
      }
    }

    if (action === "recommend_escalate" && !actor.resourceOwnerId) {
      throw new BadRequestException(
        "You are at the top of the hierarchy. Escalate is unavailable."
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const previousStatus = point.status;
      const previousOwnerId = point.currentOwnerId;

      if (action === "recommend_escalate") {
        const nextOwnerId = actor.resourceOwnerId!;
        await tx.decisionPointAction.create({
          data: {
            decisionPointId: point.id,
            actionType: action,
            performedById: actor.id,
            remarks,
            previousStatus,
            newStatus: "escalated_pending_next_ro",
            previousOwnerId,
            nextOwnerId,
          },
        });
        return tx.decisionPoint.update({
          where: { id: point.id },
          data: {
            status: "escalated_pending_next_ro",
            previousOwnerId: actor.id,
            currentOwnerId: nextOwnerId,
            escalationLevel: { increment: 1 },
            lastActionAt: now,
            modifiedBy: actor.id,
            version: { increment: 1 },
          },
          include: pointInclude,
        });
      }

      const newStatus = CLOSE_ACTIONS[action];
      await tx.decisionPointAction.create({
        data: {
          decisionPointId: point.id,
          actionType: action,
          performedById: actor.id,
          remarks,
          previousStatus,
          newStatus,
          previousOwnerId,
          nextOwnerId: null,
        },
      });
      return tx.decisionPoint.update({
        where: { id: point.id },
        data: {
          status: newStatus,
          currentOwnerId: null,
          previousOwnerId: previousOwnerId,
          finalActorId: actor.id,
          closedAt: now,
          lastActionAt: now,
          modifiedBy: actor.id,
          version: { increment: 1 },
        },
        include: pointInclude,
      });
    });

    const detail = this.mapDetail(updated, actor.id);
    return ser({
      ...detail,
      permissions: {
        ...detail.permissions,
        canEscalate: false,
      },
    });
  }
}
