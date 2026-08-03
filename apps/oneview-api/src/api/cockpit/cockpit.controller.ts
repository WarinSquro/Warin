import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";

@ApiTags("cockpit")
@ApiBearerAuth()
@Controller("cockpit")
export class CockpitController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("summary")
  @RequirePermissions("my_workspace")
  async summary() {
    const [employees, projects, activeEmployees, activeProjects] = await Promise.all([
      this.prisma.employee.count({ where: { isDeleted: false } }),
      this.prisma.project.count({ where: { isDeleted: false } }),
      this.prisma.employee.count({ where: { isDeleted: false, status: "active", isActive: true } }),
      this.prisma.project.count({ where: { isDeleted: false, status: "active", isActive: true } }),
    ]);
    return {
      employees,
      projects,
      activeEmployees,
      activeProjects,
      generatedAt: new Date().toISOString(),
    };
  }
}
