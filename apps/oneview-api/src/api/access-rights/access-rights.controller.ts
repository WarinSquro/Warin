import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

@ApiTags("access-rights")
@ApiBearerAuth()
@Controller("access-rights")
export class AccessRightsController {
  constructor(private readonly prisma: PrismaService) {}

  /** All employees' permission keys keyed by HRMS id — used for Access Rights list counts. */
  @Get()
  @RequirePermissions("access_rights")
  async list() {
    const employees = await this.prisma.employee.findMany({
      where: { isDeleted: false },
      select: {
        hrmsId: true,
        permissions: { select: { key: true } },
      },
    });
    const rights: Record<string, string[]> = {};
    for (const e of employees) {
      rights[e.hrmsId] = e.permissions.map((p) => p.key);
    }
    return ser({ rights });
  }

  @Get(":employeeId")
  @RequirePermissions("access_rights")
  async get(@Param("employeeId") employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: {
        isDeleted: false,
        OR: /^\d+$/.test(employeeId)
          ? [{ id: BigInt(employeeId) }, { hrmsId: employeeId }]
          : [{ hrmsId: employeeId }],
      },
      include: { permissions: true },
    });
    if (!emp) return { permissionKeys: [] };
    return ser({
      employeeId: emp.id.toString(),
      hrmsId: emp.hrmsId,
      permissionKeys: emp.permissions.map((p) => p.key),
    });
  }

  @Put(":employeeId")
  @RequirePermissions("access_rights")
  async put(@Param("employeeId") employeeId: string, @Body() body: { permissionKeys: string[] }) {
    const emp = await this.prisma.employee.findFirst({
      where: {
        OR: /^\d+$/.test(employeeId) ? [{ id: BigInt(employeeId) }, { hrmsId: employeeId }] : [{ hrmsId: employeeId }],
        isDeleted: false,
      },
    });
    if (!emp) return { ok: false };
    await this.prisma.employeePermission.deleteMany({ where: { employeeId: emp.id } });
    const keys = [...new Set(body.permissionKeys ?? [])];
    if (keys.length) {
      await this.prisma.employeePermission.createMany({
        data: keys.map((key) => ({ employeeId: emp.id, key })),
      });
    }
    return { ok: true, permissionKeys: keys };
  }
}
