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
import type { MilestoneKind, ProjectType, SetupStatus } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function slugCode(prefix: string, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${base || "item"}-${Date.now().toString(36)}`;
}

function asStatus(v: string | undefined, fallback: SetupStatus = "active"): SetupStatus {
  return v === "inactive" ? "inactive" : v === "active" ? "active" : fallback;
}

@ApiTags("masters")
@ApiBearerAuth()
@Controller("masters")
export class MastersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("customers")
  @RequirePermissions("projects", "masters")
  async customers(@Query("includeInactive") includeInactive?: string) {
    const rows = await this.prisma.customer.findMany({
      where: {
        isDeleted: false,
        ...(includeInactive === "true" ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
    });
    return ser(rows);
  }

  @Post("customers")
  @RequirePermissions("projects", "masters")
  async createCustomer(@Body() body: { name?: string; code?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const existing = await this.prisma.customer.findFirst({
      where: { name, isDeleted: false },
    });
    if (existing) {
      if (!existing.isActive) {
        const revived = await this.prisma.customer.update({
          where: { id: existing.id },
          data: { isActive: true, status: "active", deletedAt: null },
        });
        return ser(revived);
      }
      return ser(existing);
    }

    const code = body.code?.trim() || slugCode("cust", name);

    const row = await this.prisma.customer.create({
      data: { code, name },
    });
    return ser(row);
  }

  // ─── departments ─────────────────────────────────────────────────────────

  @Get("departments")
  // WCI workspace maps employee.department → competencies by dept id.
  // Planner/Availability need depts for filters without full masters access.
  @RequirePermissions(
    "masters.departments",
    "masters",
    "my_team.weekly_check_in",
    "planner",
    "availability"
  )
  async departments(@Query("includeInactive") includeInactive?: string) {
    const rows = await this.prisma.department.findMany({
      where: {
        isDeleted: false,
        ...(includeInactive === "true" ? {} : { isActive: true }),
      },
      include: { _count: { select: { employees: { where: { isDeleted: false } } } } },
      orderBy: { name: "asc" },
    });
    return ser(rows);
  }

  @Post("departments")
  @RequirePermissions("masters.departments", "masters")
  async createDepartment(@Body() body: { name?: string; code?: string; headName?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const existing = await this.prisma.department.findFirst({
      where: { name, isDeleted: false },
    });
    if (existing) {
      if (!existing.isActive) {
        const revived = await this.prisma.department.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            status: "active",
            deletedAt: null,
            headName: body.headName?.trim() || existing.headName,
            version: { increment: 1 },
          },
          include: { _count: { select: { employees: { where: { isDeleted: false } } } } },
        });
        return ser(revived);
      }
      throw new BadRequestException("Department already exists");
    }

    const code = body.code?.trim() || slugCode("dept", name);
    const row = await this.prisma.department.create({
      data: {
        code,
        name,
        headName: body.headName?.trim() || null,
      },
      include: { _count: { select: { employees: { where: { isDeleted: false } } } } },
    });
    return ser(row);
  }

  @Put("departments/:code")
  @RequirePermissions("masters.departments", "masters")
  async updateDepartment(
    @Param("code") code: string,
    @Body() body: { name?: string; headName?: string; status?: SetupStatus }
  ) {
    const row = await this.prisma.department.findFirst({
      where: { code, isDeleted: false },
    });
    if (!row) throw new NotFoundException("Department not found");

    const name = body.name?.trim();
    if (name && name !== row.name) {
      const clash = await this.prisma.department.findFirst({
        where: { name, isDeleted: false, NOT: { id: row.id } },
      });
      if (clash) throw new BadRequestException("Department name already exists");
    }

    const status = asStatus(body.status, row.status);
    const updated = await this.prisma.department.update({
      where: { id: row.id },
      data: {
        name: name || row.name,
        headName: body.headName !== undefined ? body.headName.trim() || null : row.headName,
        status,
        isActive: status === "active",
        version: { increment: 1 },
      },
      include: { _count: { select: { employees: { where: { isDeleted: false } } } } },
    });
    return ser(updated);
  }

  // ─── skill categories ────────────────────────────────────────────────────

  @Get("skill-categories")
  @RequirePermissions("masters.skills", "masters")
  async skillCategories(@Query("includeInactive") includeInactive?: string) {
    const rows = await this.prisma.skillCategory.findMany({
      where: {
        isDeleted: false,
        ...(includeInactive === "true" ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
    });
    return ser(rows);
  }

  @Post("skill-categories")
  @RequirePermissions("masters.skills", "masters")
  async createSkillCategory(@Body() body: { name?: string; code?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const existing = await this.prisma.skillCategory.findFirst({
      where: { name, isDeleted: false },
    });
    if (existing) {
      if (!existing.isActive) {
        const revived = await this.prisma.skillCategory.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            status: "active",
            deletedAt: null,
            version: { increment: 1 },
          },
        });
        return ser(revived);
      }
      throw new BadRequestException("Skill category already exists");
    }

    const code = body.code?.trim() || slugCode("scat", name);
    const row = await this.prisma.skillCategory.create({
      data: { code, name },
    });
    return ser(row);
  }

  // ─── skills ──────────────────────────────────────────────────────────────

  @Get("skills")
  // Availability skill filters + allocation UX without full masters access.
  @RequirePermissions("masters.skills", "masters", "planner", "availability")
  async skills(@Query("includeInactive") includeInactive?: string) {
    const rows = await this.prisma.skill.findMany({
      where: {
        isDeleted: false,
        ...(includeInactive === "true" ? {} : { isActive: true }),
      },
      include: {
        category: true,
        _count: { select: { employees: true } },
      },
      orderBy: { name: "asc" },
    });
    return ser(
      rows.map((r) => ({
        ...r,
        categoryId: r.categoryId,
        category: r.category.name,
      }))
    );
  }

  @Post("skills")
  @RequirePermissions("masters.skills", "masters")
  async createSkill(
    @Body() body: { name?: string; categoryId?: string | number; category?: string; code?: string }
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const categoryId = await this.resolveSkillCategoryId(body.categoryId, body.category);

    const existing = await this.prisma.skill.findFirst({
      where: { name, isDeleted: false },
    });
    if (existing) {
      if (!existing.isActive) {
        const revived = await this.prisma.skill.update({
          where: { id: existing.id },
          data: {
            categoryId,
            isActive: true,
            status: "active",
            deletedAt: null,
            version: { increment: 1 },
          },
          include: {
            category: true,
            _count: { select: { employees: true } },
          },
        });
        return ser({
          ...revived,
          categoryId: revived.categoryId,
          category: revived.category.name,
        });
      }
      throw new BadRequestException("Skill already exists");
    }

    const code = body.code?.trim() || slugCode("sk", name);
    const row = await this.prisma.skill.create({
      data: { code, name, categoryId },
      include: {
        category: true,
        _count: { select: { employees: true } },
      },
    });
    return ser({
      ...row,
      categoryId: row.categoryId,
      category: row.category.name,
    });
  }

  @Put("skills/:code")
  @RequirePermissions("masters.skills", "masters")
  async updateSkill(
    @Param("code") code: string,
    @Body()
    body: {
      name?: string;
      categoryId?: string | number;
      category?: string;
      status?: SetupStatus;
    }
  ) {
    const row = await this.prisma.skill.findFirst({
      where: { code, isDeleted: false },
    });
    if (!row) throw new NotFoundException("Skill not found");

    const name = body.name?.trim();
    if (name && name !== row.name) {
      const clash = await this.prisma.skill.findFirst({
        where: { name, isDeleted: false, NOT: { id: row.id } },
      });
      if (clash) throw new BadRequestException("Skill name already exists");
    }

    const status = asStatus(body.status, row.status);
    const categoryId =
      body.categoryId != null || body.category
        ? await this.resolveSkillCategoryId(body.categoryId, body.category)
        : row.categoryId;

    const updated = await this.prisma.skill.update({
      where: { id: row.id },
      data: {
        name: name || row.name,
        categoryId,
        status,
        isActive: status === "active",
        version: { increment: 1 },
      },
      include: {
        category: true,
        _count: { select: { employees: true } },
      },
    });
    return ser({
      ...updated,
      categoryId: updated.categoryId,
      category: updated.category.name,
    });
  }

  private async resolveSkillCategoryId(
    categoryId: string | number | undefined,
    categoryName: string | undefined
  ): Promise<bigint> {
    if (categoryId != null && String(categoryId).trim() !== "") {
      const id = BigInt(String(categoryId));
      const row = await this.prisma.skillCategory.findFirst({
        where: { id, isDeleted: false, isActive: true },
      });
      if (!row) throw new BadRequestException("Skill category not found");
      return row.id;
    }
    const name = categoryName?.trim();
    if (!name) throw new BadRequestException("categoryId is required");
    const byName = await this.prisma.skillCategory.findFirst({
      where: { name, isDeleted: false },
    });
    if (!byName) throw new BadRequestException("Skill category not found");
    if (!byName.isActive) {
      throw new BadRequestException("Skill category is inactive");
    }
    return byName.id;
  }

  // ─── activities ──────────────────────────────────────────────────────────

  @Get("activities")
  // Allocation drawer activity dropdown — planners need read without masters.activities.
  @RequirePermissions("masters.activities", "masters", "planner", "availability")
  async activities(@Query("includeInactive") includeInactive?: string) {
    const rows = await this.prisma.activity.findMany({
      where: {
        isDeleted: false,
        ...(includeInactive === "true" ? {} : { isActive: true }),
      },
      include: { milestone: true },
      orderBy: { name: "asc" },
    });
    return ser(rows);
  }

  @Post("activities")
  @RequirePermissions("masters.activities", "masters")
  async createActivity(
    @Body()
    body: {
      name?: string;
      code?: string;
      billable?: boolean;
      milestoneCode?: string;
      milestoneId?: string;
    }
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const milestoneCode = (body.milestoneCode || body.milestoneId)?.trim();
    if (!milestoneCode) throw new BadRequestException("milestoneCode is required");

    const milestone = await this.prisma.activityMilestone.findFirst({
      where: { code: milestoneCode, isDeleted: false, isActive: true },
    });
    if (!milestone) throw new BadRequestException("Milestone not found");

    const code = body.code?.trim() || slugCode("act", name);
    const billable = body.billable !== false;

    const row = await this.prisma.activity.create({
      data: {
        code,
        name,
        billable,
        activityMilestoneId: milestone.id,
      },
      include: { milestone: true },
    });
    return ser(row);
  }

  @Put("activities/:code")
  @RequirePermissions("masters.activities", "masters")
  async updateActivity(
    @Param("code") code: string,
    @Body()
    body: {
      name?: string;
      billable?: boolean;
      milestoneCode?: string;
      milestoneId?: string;
      status?: SetupStatus;
    }
  ) {
    const row = await this.prisma.activity.findFirst({
      where: { code, isDeleted: false },
      include: { milestone: true },
    });
    if (!row) throw new NotFoundException("Activity not found");

    let activityMilestoneId = row.activityMilestoneId;
    const milestoneCode = (body.milestoneCode || body.milestoneId)?.trim();
    if (milestoneCode) {
      const milestone = await this.prisma.activityMilestone.findFirst({
        where: { code: milestoneCode, isDeleted: false, isActive: true },
      });
      if (!milestone) throw new BadRequestException("Milestone not found");
      activityMilestoneId = milestone.id;
    }

    const status = asStatus(body.status, row.status);
    const updated = await this.prisma.activity.update({
      where: { id: row.id },
      data: {
        name: body.name?.trim() || row.name,
        billable: body.billable !== undefined ? body.billable : row.billable,
        activityMilestoneId,
        status,
        isActive: status === "active",
        version: { increment: 1 },
      },
      include: { milestone: true },
    });
    return ser(updated);
  }

  // ─── activity milestones ─────────────────────────────────────────────────

  @Get("activity-milestones")
  // Used with activities to resolve milestone→activity mapping in Allocation drawer.
  @RequirePermissions("masters.activities", "masters", "planner", "availability")
  async activityMilestones() {
    const rows = await this.prisma.activityMilestone.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: { name: "asc" },
    });
    return ser(rows);
  }

  @Post("activity-milestones")
  @RequirePermissions("masters.activities", "masters")
  async createActivityMilestone(
    @Body()
    body: {
      name?: string;
      code?: string;
      projectType?: ProjectType;
      kind?: MilestoneKind;
    }
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");
    if (!body.projectType) throw new BadRequestException("projectType is required");
    if (!body.kind) throw new BadRequestException("kind is required");

    const existing = await this.prisma.activityMilestone.findFirst({
      where: { name, projectType: body.projectType, isDeleted: false },
    });
    if (existing) {
      if (!existing.isActive) {
        const revived = await this.prisma.activityMilestone.update({
          where: { id: existing.id },
          data: {
            kind: body.kind,
            isActive: true,
            deletedAt: null,
            version: { increment: 1 },
          },
        });
        return ser(revived);
      }
      return ser(existing);
    }

    const code = body.code?.trim() || slugCode("am", name);
    const row = await this.prisma.activityMilestone.create({
      data: {
        code,
        name,
        projectType: body.projectType,
        kind: body.kind,
      },
    });
    return ser(row);
  }
}
