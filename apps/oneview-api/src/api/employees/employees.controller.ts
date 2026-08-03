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
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { HashingService } from "@oneview/security";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

const DEFAULT_PIN = "12345";

type EmpBody = {
  hrmsId: string;
  name: string;
  email: string;
  department: string;
  skills?: string[];
  resourceOwnerHrmsId?: string | null;
  status?: "active" | "inactive";
};

@ApiTags("employees")
@ApiBearerAuth()
@Controller("employees")
export class EmployeesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService
  ) {}

  private mapRow(e: {
    id: bigint;
    hrmsId: string;
    name: string;
    email: string;
    departmentId: bigint | null;
    department?: { name: string } | null;
    resourceOwnerId: bigint | null;
    resourceOwner?: { hrmsId: string; name: string } | null;
    status: "active" | "inactive";
    isSuperAdmin: boolean;
    utilization: number | null;
    skills: { skill: { name: string } }[];
  }) {
    return {
      id: e.id.toString(),
      hrmsId: e.hrmsId,
      name: e.name,
      email: e.email,
      departmentId: e.departmentId?.toString() ?? null,
      departmentName: e.department?.name ?? null,
      resourceOwnerId: e.resourceOwnerId?.toString() ?? null,
      resourceOwnerHrmsId: e.resourceOwner?.hrmsId ?? null,
      resourceOwnerName: e.resourceOwner?.name ?? null,
      status: e.status,
      isSuperAdmin: e.isSuperAdmin,
      utilization: e.utilization,
      skills: e.skills.map((s) => s.skill.name),
    };
  }

  private async findEmp(id: string) {
    return this.prisma.employee.findFirst({
      where: {
        isDeleted: false,
        OR: /^\d+$/.test(id) ? [{ id: BigInt(id) }, { hrmsId: id }] : [{ hrmsId: id }],
      },
    });
  }

  @Get()
  // WCI reviewers + planner/availability need roster; write ops stay employees-only.
  @RequirePermissions("employees", "my_team.weekly_check_in", "planner", "availability")
  async list(@Query("status") status?: string) {
    const rows = await this.prisma.employee.findMany({
      where: {
        isDeleted: false,
        ...(status ? { status: status as "active" | "inactive" } : {}),
      },
      include: {
        department: true,
        skills: { include: { skill: true } },
        resourceOwner: { select: { id: true, hrmsId: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
    return ser(rows.map((e) => this.mapRow(e)));
  }

  @Get(":id")
  @RequirePermissions("employees", "my_team.weekly_check_in", "planner", "availability")
  async one(@Param("id") id: string) {
    const e = await this.prisma.employee.findFirst({
      where: {
        isDeleted: false,
        OR: /^\d+$/.test(id) ? [{ id: BigInt(id) }, { hrmsId: id }] : [{ hrmsId: id }],
      },
      include: {
        department: true,
        skills: { include: { skill: true } },
        resourceOwner: { select: { id: true, hrmsId: true, name: true } },
        permissions: true,
      },
    });
    if (!e) throw new NotFoundException("Employee not found");
    return ser({
      ...this.mapRow(e),
      permissionKeys: e.permissions.map((p) => p.key),
    });
  }

  @Post()
  @RequirePermissions("employees")
  async create(@Body() body: EmpBody) {
    const hrmsId = body.hrmsId?.trim();
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!hrmsId || !name || !email) {
      throw new BadRequestException("hrmsId, name, and email are required");
    }

    const existing = await this.prisma.employee.findFirst({
      where: { OR: [{ hrmsId }, { email }], isDeleted: false },
    });
    if (existing) throw new BadRequestException("HRMS ID or email already exists");

    const dept = await this.prisma.department.findFirst({
      where: { name: body.department, isDeleted: false },
    });
    if (!dept) throw new BadRequestException(`Unknown department: ${body.department}`);

    let resourceOwnerId: bigint | null = null;
    if (body.resourceOwnerHrmsId) {
      const owner = await this.prisma.employee.findFirst({
        where: { hrmsId: body.resourceOwnerHrmsId, isDeleted: false },
      });
      if (!owner) throw new BadRequestException("Resource owner not found");
      resourceOwnerId = owner.id;
    }

    const skillNames = [...new Set(body.skills ?? [])];
    const skills = skillNames.length
      ? await this.prisma.skill.findMany({
          where: { name: { in: skillNames }, isDeleted: false },
        })
      : [];

    const pinHash = await this.hashing.hash(DEFAULT_PIN);
    const status = body.status === "inactive" ? "inactive" : "active";

    const created = await this.prisma.employee.create({
      data: {
        hrmsId,
        name,
        email,
        pinHash,
        departmentId: dept.id,
        resourceOwnerId,
        status,
        isActive: status === "active",
        skills: {
          create: skills.map((s) => ({ skillId: s.id })),
        },
      },
      include: {
        department: true,
        skills: { include: { skill: true } },
        resourceOwner: { select: { id: true, hrmsId: true, name: true } },
      },
    });

    return ser(this.mapRow(created));
  }

  @Put(":id")
  @RequirePermissions("employees")
  async update(@Param("id") id: string, @Body() body: Partial<EmpBody>) {
    const emp = await this.findEmp(id);
    if (!emp) throw new NotFoundException("Employee not found");

    let departmentId = emp.departmentId;
    if (body.department) {
      const dept = await this.prisma.department.findFirst({
        where: { name: body.department, isDeleted: false },
      });
      if (!dept) throw new BadRequestException(`Unknown department: ${body.department}`);
      departmentId = dept.id;
    }

    let resourceOwnerId = emp.resourceOwnerId;
    if (body.resourceOwnerHrmsId !== undefined) {
      if (!body.resourceOwnerHrmsId) {
        resourceOwnerId = null;
      } else {
        const owner = await this.prisma.employee.findFirst({
          where: { hrmsId: body.resourceOwnerHrmsId, isDeleted: false },
        });
        if (!owner) throw new BadRequestException("Resource owner not found");
        resourceOwnerId = owner.id;
      }
    }

    const status = body.status ?? emp.status;

    if (body.skills) {
      await this.prisma.employeeSkill.deleteMany({ where: { employeeId: emp.id } });
      const skills = await this.prisma.skill.findMany({
        where: { name: { in: body.skills }, isDeleted: false },
      });
      if (skills.length) {
        await this.prisma.employeeSkill.createMany({
          data: skills.map((s) => ({ employeeId: emp.id, skillId: s.id })),
        });
      }
    }

    const updated = await this.prisma.employee.update({
      where: { id: emp.id },
      data: {
        name: body.name?.trim() ?? emp.name,
        email: body.email?.trim().toLowerCase() ?? emp.email,
        departmentId,
        resourceOwnerId,
        status,
        isActive: status === "active",
        version: { increment: 1 },
      },
      include: {
        department: true,
        skills: { include: { skill: true } },
        resourceOwner: { select: { id: true, hrmsId: true, name: true } },
      },
    });

    return ser(this.mapRow(updated));
  }
}
