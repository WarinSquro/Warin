import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { MilestoneKind, ProjectHealth, ProjectType } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";
import type { JwtPayload } from "../auth/jwt.strategy";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

const PROJECT_INCLUDE = {
  milestones: true,
  demandLines: true,
  customer: true,
  _count: { select: { allocations: { where: { isDeleted: false } } } },
} as const;

function parseDate(iso?: string | null): Date | null {
  if (!iso || !String(iso).trim()) return null;
  const day = String(iso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

const PROJECT_CODE_MAX = 10;
const PROJECT_NAME_MAX = 25;
const CUSTOMER_NAME_MAX = 25;
const PO_NUMBER_MAX = 15;

function assertProjectFieldLengths(fields: {
  projectCode?: string | null;
  name?: string | null;
  poNumber?: string | null;
}) {
  if (fields.projectCode != null && fields.projectCode.length > PROJECT_CODE_MAX) {
    throw new BadRequestException(`projectCode must be ${PROJECT_CODE_MAX} characters or fewer`);
  }
  if (fields.name != null && fields.name.length > PROJECT_NAME_MAX) {
    throw new BadRequestException(`name must be ${PROJECT_NAME_MAX} characters or fewer`);
  }
  if (fields.poNumber != null && fields.poNumber.length > PO_NUMBER_MAX) {
    throw new BadRequestException(`poNumber must be ${PO_NUMBER_MAX} characters or fewer`);
  }
}

/** Milestone dates must be on/after the later of kickoff and start. */
function assertMilestoneDatesNotBeforeProject(
  milestones: { date?: string }[] | undefined,
  kickoffDate: Date,
  startDate: Date
) {
  const floor = kickoffDate.getTime() > startDate.getTime() ? kickoffDate : startDate;
  for (const m of milestones ?? []) {
    const d = parseDate(m.date);
    if (d && d.getTime() < floor.getTime()) {
      throw new BadRequestException(
        "Milestone date cannot be earlier than project kickoff or start date"
      );
    }
  }
}

function parseHealth(raw?: string | null): ProjectHealth {
  if (raw === "amber" || raw === "red" || raw === "green") return raw;
  return "green";
}

function actorId(user?: JwtPayload): bigint | null {
  if (!user?.sub || !/^\d+$/.test(user.sub)) return null;
  return BigInt(user.sub);
}

type ProjectBody = {
  projectCode: string;
  name: string;
  /** Customer display name (resolved to customers.id) or numeric customerId */
  customer?: string;
  customerId?: string;
  poNumber?: string;
  type: ProjectType;
  approvedByName?: string;
  approvedByDate?: string;
  /** Filename and/or data-URL JSON for POC email snap */
  approvedBySnap?: string | null;
  kickoffDate: string;
  startDate: string;
  endDate: string;
  demand?: string;
  health?: ProjectHealth;
  healthRemarks?: string;
  status?: "active" | "inactive";
  milestones?: { name: string; date: string; kind?: MilestoneKind }[];
  demandLines?: { skills: string[]; count: number }[];
};

type ProjectRow = {
  id: bigint;
  projectCode: string;
  name: string;
  customerId: bigint;
  poNumber: string;
  type: ProjectType;
  approvedByName: string | null;
  approvedByDate: Date | null;
  approvedBySnap: string | null;
  kickoffDate: Date;
  startDate: Date;
  endDate: Date;
  demand: string;
  health: ProjectHealth;
  healthRemarks: string;
  status: "active" | "inactive";
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  modifiedAt: Date;
  createdBy: bigint | null;
  modifiedBy: bigint | null;
  version: number;
  customer: { id: bigint; name: string; code: string };
  milestones: unknown[];
  demandLines: unknown[];
  _count?: { allocations: number };
};

@ApiTags("projects")
@ApiBearerAuth()
@Controller("projects")
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  private mapProject(
    row: ProjectRow,
    nameById: Map<string, string> = new Map()
  ) {
    const { customer, _count, ...rest } = row;
    return {
      ...rest,
      customerId: customer.id.toString(),
      customer: customer.name,
      allocationCount: _count?.allocations ?? 0,
      createdByName: row.createdBy
        ? nameById.get(row.createdBy.toString()) ?? null
        : null,
      modifiedByName: row.modifiedBy
        ? nameById.get(row.modifiedBy.toString()) ?? null
        : null,
    };
  }

  private async actorNameMap(
    rows: { createdBy: bigint | null; modifiedBy: bigint | null }[]
  ): Promise<Map<string, string>> {
    const ids = new Set<bigint>();
    for (const r of rows) {
      if (r.createdBy) ids.add(r.createdBy);
      if (r.modifiedBy) ids.add(r.modifiedBy);
    }
    if (ids.size === 0) return new Map();
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: [...ids] }, isDeleted: false },
      select: { id: true, name: true },
    });
    return new Map(emps.map((e) => [e.id.toString(), e.name]));
  }

  private async resolveCustomerId(body: {
    customer?: string;
    customerId?: string;
  }): Promise<bigint> {
    if (body.customerId && /^\d+$/.test(body.customerId.trim())) {
      const byId = await this.prisma.customer.findFirst({
        where: { id: BigInt(body.customerId.trim()), isDeleted: false },
      });
      if (byId) return byId.id;
      throw new BadRequestException("Customer not found");
    }
    const name = body.customer?.trim();
    if (!name) throw new BadRequestException("customer is required");
    const byName = await this.prisma.customer.findFirst({
      where: { name, isDeleted: false },
    });
    if (byName) return byName.id;
    throw new BadRequestException(`Customer not found: ${name}`);
  }

  @Get()
  @RequirePermissions("projects", "planner", "availability")
  async list(@Query("status") status?: string) {
    const rows = await this.prisma.project.findMany({
      where: {
        isDeleted: false,
        ...(status ? { status: status as "active" | "inactive" } : {}),
      },
      include: PROJECT_INCLUDE,
      orderBy: { projectCode: "asc" },
    });
    const names = await this.actorNameMap(rows);
    return ser(rows.map((r) => this.mapProject(r, names)));
  }

  @Get(":id")
  @RequirePermissions("projects", "planner", "availability")
  async one(@Param("id") id: string) {
    const isNum = /^\d+$/.test(id);
    const row = await this.prisma.project.findFirst({
      where: {
        isDeleted: false,
        OR: isNum ? [{ id: BigInt(id) }, { projectCode: id }] : [{ projectCode: id }],
      },
      include: PROJECT_INCLUDE,
    });
    if (!row) throw new NotFoundException("Project not found");
    const names = await this.actorNameMap([row]);
    return ser(this.mapProject(row, names));
  }

  @Post()
  @RequirePermissions("projects")
  @EmitDataChange("projects", "create")
  async create(@Req() req: { user: JwtPayload }, @Body() body: ProjectBody) {
    const projectCode = body.projectCode?.trim();
    const name = body.name?.trim();
    if (!projectCode || !name || !body.type) {
      throw new BadRequestException("projectCode, name, and type are required");
    }
    const poNumber = body.poNumber?.trim() ?? "";
    assertProjectFieldLengths({ projectCode, name, poNumber });
    const customerId = await this.resolveCustomerId(body);
    const kickoffDate = parseDate(body.kickoffDate);
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);
    if (!kickoffDate || !startDate || !endDate) {
      throw new BadRequestException("kickoffDate, startDate, and endDate are required");
    }
    assertMilestoneDatesNotBeforeProject(body.milestones, kickoffDate, startDate);

    const exists = await this.prisma.project.findFirst({
      where: { projectCode, isDeleted: false },
    });
    if (exists) throw new BadRequestException("Project code already exists");

    const status = body.status === "inactive" ? "inactive" : "active";
    const health = parseHealth(body.health);
    const healthRemarks = (body.healthRemarks ?? "").trim();
    if ((health === "amber" || health === "red") && !healthRemarks) {
      throw new BadRequestException("healthRemarks is required when health is Amber or Red");
    }
    const actor = actorId(req.user);
    const row = await this.prisma.project.create({
      data: {
        projectCode,
        name,
        customerId,
        poNumber,
        type: body.type,
        approvedByName: body.approvedByName?.trim() || null,
        approvedByDate: parseDate(body.approvedByDate),
        approvedBySnap: body.approvedBySnap?.trim() || null,
        kickoffDate,
        startDate,
        endDate,
        demand: body.demand ?? "",
        health,
        healthRemarks,
        status,
        isActive: status === "active",
        createdBy: actor,
        modifiedBy: actor,
        milestones: {
          create: (body.milestones ?? []).map((m) => ({
            name: m.name,
            date: parseDate(m.date) ?? kickoffDate,
            kind: m.kind ?? null,
          })),
        },
        demandLines: {
          create: (body.demandLines ?? []).map((l) => ({
            skills: l.skills,
            count: l.count,
          })),
        },
      },
      include: PROJECT_INCLUDE,
    });
    const names = await this.actorNameMap([row]);
    return ser(this.mapProject(row, names));
  }

  @Put(":id")
  @RequirePermissions("projects")
  @EmitDataChange("projects", "update")
  async update(
    @Req() req: { user: JwtPayload },
    @Param("id") id: string,
    @Body() body: Partial<ProjectBody>
  ) {
    const isNum = /^\d+$/.test(id);
    const existing = await this.prisma.project.findFirst({
      where: {
        isDeleted: false,
        OR: isNum ? [{ id: BigInt(id) }, { projectCode: id }] : [{ projectCode: id }],
      },
    });
    if (!existing) throw new NotFoundException("Project not found");

    const nextName = body.name !== undefined ? body.name.trim() : existing.name;
    const nextPo =
      body.poNumber !== undefined ? body.poNumber.trim() : existing.poNumber;
    assertProjectFieldLengths({
      projectCode: existing.projectCode,
      name: nextName,
      poNumber: nextPo,
    });

    const status = body.status ?? existing.status;

    if (status === "inactive" && existing.status !== "inactive") {
      const allocationCount = await this.prisma.allocation.count({
        where: { projectId: existing.id, isDeleted: false },
      });
      if (allocationCount > 0) {
        throw new BadRequestException(
          "Project is associated with one or more allocations and cannot be disabled."
        );
      }
    }

    const health =
      body.health !== undefined ? parseHealth(body.health) : existing.health;
    const healthRemarks =
      body.healthRemarks !== undefined
        ? body.healthRemarks.trim()
        : existing.healthRemarks;
    if ((health === "amber" || health === "red") && !healthRemarks) {
      throw new BadRequestException("healthRemarks is required when health is Amber or Red");
    }
    let customerId = existing.customerId;
    if (body.customer !== undefined || body.customerId !== undefined) {
      customerId = await this.resolveCustomerId({
        customer: body.customer,
        customerId: body.customerId,
      });
    }

    if (body.milestones) {
      const kickoffForMs =
        body.kickoffDate !== undefined
          ? (parseDate(body.kickoffDate) ?? existing.kickoffDate)
          : existing.kickoffDate;
      const startForMs =
        body.startDate !== undefined
          ? (parseDate(body.startDate) ?? existing.startDate)
          : existing.startDate;
      assertMilestoneDatesNotBeforeProject(body.milestones, kickoffForMs, startForMs);
      await this.prisma.projectMilestone.deleteMany({ where: { projectId: existing.id } });
      await this.prisma.projectMilestone.createMany({
        data: body.milestones.map((m) => ({
          projectId: existing.id,
          name: m.name,
          date: parseDate(m.date) ?? existing.kickoffDate,
          kind: m.kind ?? null,
        })),
      });
    }

    if (body.demandLines) {
      await this.prisma.projectDemandLine.deleteMany({ where: { projectId: existing.id } });
      if (body.demandLines.length) {
        await this.prisma.projectDemandLine.createMany({
          data: body.demandLines.map((l) => ({
            projectId: existing.id,
            skills: l.skills,
            count: l.count,
          })),
        });
      }
    }

    const actor = actorId(req.user);
    const row = await this.prisma.project.update({
      where: { id: existing.id },
      data: {
        name: nextName,
        customer: { connect: { id: customerId } },
        poNumber: nextPo,
        type: body.type ?? existing.type,
        approvedByName:
          body.approvedByName !== undefined
            ? body.approvedByName.trim() || null
            : existing.approvedByName,
        approvedByDate:
          body.approvedByDate !== undefined
            ? parseDate(body.approvedByDate)
            : existing.approvedByDate,
        approvedBySnap:
          body.approvedBySnap !== undefined
            ? body.approvedBySnap?.trim() || null
            : existing.approvedBySnap,
        kickoffDate:
          body.kickoffDate !== undefined
            ? (parseDate(body.kickoffDate) ?? existing.kickoffDate)
            : existing.kickoffDate,
        startDate:
          body.startDate !== undefined
            ? (parseDate(body.startDate) ?? existing.startDate)
            : existing.startDate,
        endDate:
          body.endDate !== undefined
            ? (parseDate(body.endDate) ?? existing.endDate)
            : existing.endDate,
        demand: body.demand !== undefined ? body.demand : existing.demand,
        health,
        healthRemarks,
        status,
        isActive: status === "active",
        modifiedBy: actor ?? existing.modifiedBy,
        version: { increment: 1 },
      },
      include: PROJECT_INCLUDE,
    });
    const names = await this.actorNameMap([row]);
    return ser(this.mapProject(row, names));
  }
}
