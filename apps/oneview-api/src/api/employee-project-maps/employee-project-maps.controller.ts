import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";
import type { JwtPayload } from "../auth/jwt.strategy";
import { descendantEmployeeIds } from "../auth/resource-owner-tree";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function actorPk(user?: JwtPayload): bigint | null {
  if (!user?.sub || !/^\d+$/.test(user.sub)) return null;
  return BigInt(user.sub);
}

function isAdministratorEmployee(emp: {
  isSuperAdmin?: boolean;
  name?: string | null;
  hrmsId?: string | null;
}): boolean {
  return (
    Boolean(emp.isSuperAdmin) ||
    (emp.hrmsId ?? "").trim() === "EMP-0001" ||
    (emp.name ?? "").trim().toLowerCase() === "administrator"
  );
}

@ApiTags("employee-project-maps")
@ApiBearerAuth()
@Controller("employee-project-maps")
export class EmployeeProjectMapsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Super-admin: all active non-admin. RO: direct+indirect only. Else: empty. */
  private async mappableEmployeeIds(user: JwtPayload): Promise<bigint[] | "all"> {
    if (user.isSuperAdmin) return "all";
    const pk = actorPk(user);
    if (!pk) return [];
    const rows = await this.prisma.employee.findMany({
      where: { isDeleted: false },
      select: { id: true, resourceOwnerId: true },
    });
    const tree = descendantEmployeeIds(
      pk.toString(),
      rows.map((r) => ({
        id: r.id.toString(),
        resourceOwnerId: r.resourceOwnerId?.toString() ?? null,
      }))
    );
    return tree.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
  }

  private async assertEmployeesMappable(user: JwtPayload, employeeIds: bigint[]) {
    const scope = await this.mappableEmployeeIds(user);
    if (scope === "all") return;
    const allowed = new Set(scope.map((id) => id.toString()));
    for (const id of employeeIds) {
      if (!allowed.has(id.toString())) {
        throw new ForbiddenException("Employee is outside your mapping scope");
      }
    }
  }

  @Get()
  @RequirePermissions("projects")
  async list(@Req() req: { user: JwtPayload }) {
    const scope = await this.mappableEmployeeIds(req.user);
    const whereEmp =
      scope === "all"
        ? {
            isDeleted: false,
            isActive: true,
            status: "active" as const,
          }
        : {
            id: { in: scope },
            isDeleted: false,
            isActive: true,
            status: "active" as const,
          };

    if (scope !== "all" && scope.length === 0) {
      return ser({ employees: [] as unknown[] });
    }

    const employees = await this.prisma.employee.findMany({
      where: whereEmp,
      include: {
        department: { select: { name: true } },
        projectMaps: {
          include: {
            project: {
              select: {
                id: true,
                projectCode: true,
                name: true,
                status: true,
                isDeleted: true,
                isActive: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const rows = employees
      .filter((e) => !isAdministratorEmployee(e))
      .map((e) => ({
        hrmsId: e.hrmsId,
        name: e.name,
        department: e.department?.name ?? "",
        projects: e.projectMaps
          .filter((m) => !m.project.isDeleted && m.project.isActive && m.project.status === "active")
          .map((m) => ({
            projectCode: m.project.projectCode,
            name: m.project.name,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));

    return ser({ employees: rows });
  }

  /** Project codes the resource may be allocated against (Work Allocation filter). */
  @Get("for-employee/:hrmsId")
  @RequirePermissions("projects", "planner")
  async forEmployee(@Param("hrmsId") hrmsId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { hrmsId: hrmsId?.trim(), isDeleted: false },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException("Employee not found");

    const maps = await this.prisma.employeeProjectMap.findMany({
      where: {
        employeeId: emp.id,
        project: { isDeleted: false, isActive: true, status: "active" },
      },
      include: { project: { select: { projectCode: true } } },
    });

    return ser({
      projectCodes: maps.map((m) => m.project.projectCode).sort(),
    });
  }

  @Post()
  @RequirePermissions("projects")
  @EmitDataChange("projects", "update")
  async map(
    @Req() req: { user: JwtPayload },
    @Body() body: { employeeHrmsIds?: string[]; projectCode?: string }
  ) {
    const codes = (body.employeeHrmsIds ?? []).map((x) => String(x).trim()).filter(Boolean);
    const projectCode = body.projectCode?.trim();
    if (codes.length === 0) throw new BadRequestException("Select at least one employee");
    if (!projectCode) throw new BadRequestException("projectCode is required");

    const project = await this.prisma.project.findFirst({
      where: { projectCode, isDeleted: false, isActive: true, status: "active" },
    });
    if (!project) throw new BadRequestException("Active project not found");

    const employees = await this.prisma.employee.findMany({
      where: { hrmsId: { in: codes }, isDeleted: false, isActive: true, status: "active" },
    });
    if (employees.length !== codes.length) {
      throw new BadRequestException("One or more employees were not found or are inactive");
    }
    for (const e of employees) {
      if (isAdministratorEmployee(e)) {
        throw new BadRequestException("Administrator cannot be mapped to projects");
      }
    }

    await this.assertEmployeesMappable(
      req.user,
      employees.map((e) => e.id)
    );

    const createdBy = actorPk(req.user);
    await this.prisma.employeeProjectMap.createMany({
      data: employees.map((e) => ({
        employeeId: e.id,
        projectId: project.id,
        createdBy,
      })),
      skipDuplicates: true,
    });

    return ser({ ok: true, mapped: employees.length, projectCode: project.projectCode });
  }

  @Delete()
  @RequirePermissions("projects")
  @EmitDataChange("projects", "update")
  async unmap(
    @Req() req: { user: JwtPayload },
    @Body() body: { employeeHrmsId?: string; projectCode?: string }
  ) {
    const hrmsId = body.employeeHrmsId?.trim();
    const projectCode = body.projectCode?.trim();
    if (!hrmsId || !projectCode) {
      throw new BadRequestException("employeeHrmsId and projectCode are required");
    }

    const emp = await this.prisma.employee.findFirst({
      where: { hrmsId, isDeleted: false },
    });
    if (!emp) throw new NotFoundException("Employee not found");
    await this.assertEmployeesMappable(req.user, [emp.id]);

    const project = await this.prisma.project.findFirst({
      where: { projectCode, isDeleted: false },
    });
    if (!project) throw new NotFoundException("Project not found");

    await this.prisma.employeeProjectMap.deleteMany({
      where: { employeeId: emp.id, projectId: project.id },
    });

    return ser({ ok: true });
  }
}
