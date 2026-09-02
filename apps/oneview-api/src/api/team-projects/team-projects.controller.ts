import { Controller, ForbiddenException, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { ProjectHealth, ProjectStatus, ProjectType } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { descendantEmployeeIds } from "../auth/resource-owner-tree";
import { RequirePermissions } from "../auth/guards";
import {
  addDaysISO,
  allocationOverlapsRange,
  markMilestones,
  mondayOfISO,
  plannedHoursInRange,
  todayLocalISO,
  workingWeekDates,
} from "./team-projects.util";

function ser<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
  ) as T;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type StatusFilter = "active" | "inactive" | "all";

@ApiTags("team-projects")
@ApiBearerAuth()
@Controller("team-projects")
export class TeamProjectsController {
  constructor(private readonly prisma: PrismaService) {}

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

  @Get()
  @RequirePermissions("my_team.team_projects")
  async list(
    @Req() req: { user: JwtPayload },
    @Query("status") status?: string
  ) {
    const actor = await this.prisma.employee.findFirst({
      where: { id: BigInt(req.user.sub), isDeleted: false },
    });
    if (!actor) throw new ForbiddenException("Employee not found");

    const statusFilter: StatusFilter =
      status === "inactive" || status === "all" ? status : "active";

    const today = todayLocalISO();
    const weekMonday = mondayOfISO(today);

    const settings = await this.prisma.appSettings.findFirst({
      where: { code: "default", isDeleted: false },
      select: { workingDays: true },
    });
    const workingDays = settings?.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const weekDates = workingWeekDates(weekMonday, workingDays);
    const weekStart = weekDates[0] ?? weekMonday;
    const weekEnd = weekDates[weekDates.length - 1] ?? weekMonday;
    const nextWeekMonday = addDaysISO(weekMonday, 7);
    const nextWeekDates = workingWeekDates(nextWeekMonday, workingDays);
    const nextWeekStart = nextWeekDates[0] ?? nextWeekMonday;
    const nextWeekEnd = nextWeekDates[nextWeekDates.length - 1] ?? nextWeekMonday;

    const offRows = await this.prisma.companyOffDay.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        date: {
          gte: new Date(`${weekStart}T00:00:00.000Z`),
          lte: new Date(`${nextWeekEnd}T00:00:00.000Z`),
        },
      },
      select: { date: true },
    });
    const companyOffSet = new Set(offRows.map((d) => isoDate(d.date)));

    let reportIds: bigint[];
    if (req.user.isSuperAdmin) {
      const rows = await this.prisma.employee.findMany({
        where: { isDeleted: false, isActive: true, status: "active", isSuperAdmin: false },
        select: { id: true },
      });
      reportIds = rows.filter((e) => e.id !== actor.id).map((e) => e.id);
    } else {
      reportIds = await this.reportSubtreeIds(actor.id);
    }

    if (reportIds.length === 0) {
      return ser({ items: [], weekStart, weekEnd });
    }

    // Match Resource Planner: include this week + next week allocations (not only active today).
    const windowStart = weekStart;
    const windowEnd = nextWeekEnd;
    const prismaFrom = new Date(`${addDaysISO(windowStart, -1)}T00:00:00.000Z`);
    const prismaTo = new Date(`${addDaysISO(windowEnd, 1)}T00:00:00.000Z`);

    const allocationRows = await this.prisma.allocation.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        employeeId: { in: reportIds },
        startDate: { lte: prismaTo },
        endDate: { gte: prismaFrom },
        project: { isDeleted: false },
      },
      select: {
        id: true,
        employeeId: true,
        projectId: true,
        startDate: true,
        endDate: true,
        hoursPerDay: true,
        employee: { select: { id: true, hrmsId: true, name: true, resourceOwnerId: true } },
      },
    });

    const allocations = allocationRows.filter((a) =>
      allocationOverlapsRange(isoDate(a.startDate), isoDate(a.endDate), windowStart, windowEnd)
    );

    const projectIds = [...new Set(allocations.map((a) => a.projectId))];
    if (projectIds.length === 0) {
      return ser({ items: [], weekStart, weekEnd });
    }

    const projects = await this.prisma.project.findMany({
      where: {
        id: { in: projectIds },
        isDeleted: false,
        ...(statusFilter === "active"
          ? { status: "active" as ProjectStatus, isActive: true }
          : statusFilter === "inactive"
            ? { OR: [{ status: "inactive" as ProjectStatus }, { isActive: false }] }
            : {}),
      },
      include: {
        customer: { select: { name: true } },
        milestones: {
          where: { isDeleted: false },
          orderBy: { date: "asc" },
          select: { id: true, name: true, date: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const items = projects.map((p) => {
      const projectAllocs = allocations.filter((a) => a.projectId === p.id);
      const memberMap = new Map<
        string,
        { employeeId: string; hrmsId: string; name: string; relation: "direct" | "indirect" }
      >();
      for (const a of projectAllocs) {
        const key = a.employee.id.toString();
        if (!memberMap.has(key)) {
          memberMap.set(key, {
            employeeId: key,
            hrmsId: a.employee.hrmsId,
            name: a.employee.name,
            relation:
              a.employee.resourceOwnerId === actor.id ? "direct" : ("indirect" as const),
          });
        }
      }
      const members = [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name));

      const memberAllocSlices = projectAllocs.map((a) => ({
        startDate: isoDate(a.startDate),
        endDate: isoDate(a.endDate),
        hoursPerDay: a.hoursPerDay,
      }));

      const weekPlannedHours = plannedHoursInRange(
        memberAllocSlices,
        weekStart,
        weekEnd,
        workingDays,
        companyOffSet
      );
      const nextWeekPlannedHours = plannedHoursInRange(
        memberAllocSlices,
        nextWeekStart,
        nextWeekEnd,
        workingDays,
        companyOffSet
      );

      return {
        projectId: p.id.toString(),
        projectCode: p.projectCode,
        projectName: p.name,
        customerName: p.customer.name,
        type: p.type as ProjectType,
        status: p.status as ProjectStatus,
        isActive: p.isActive,
        startDate: isoDate(p.startDate),
        endDate: isoDate(p.endDate),
        health: p.health as ProjectHealth,
        teamHeadcount: members.length,
        weekPlannedHours,
        nextWeekPlannedHours,
        weekStart,
        weekEnd,
        nextWeekStart,
        nextWeekEnd,
        members,
        milestones: markMilestones(p.milestones, today),
      };
    });

    return ser({ items, weekStart, weekEnd });
  }
}
