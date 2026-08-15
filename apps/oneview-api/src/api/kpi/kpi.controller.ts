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
  Put,
  Query,
  Req,
  StreamableFile,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type {
  AssessmentCycle,
  KpiRowStatus,
  KpiTargetDirection,
  Prisma,
} from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { StorageService } from "@oneview/storage";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { RequirePermissions } from "../auth/guards";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";
import {
  CYCLE_MONTHS,
  isCycleExpired,
  isPeriodExpired,
  monthsLabel,
  parseCycle,
  validatePeriodMonths,
  assertKpiMasterNameLength,
  KPI_RO_REMARKS_MAX,
} from "./kpi.util";

const Decimal = PrismaNS.Decimal;
type DecimalValue = PrismaNS.Decimal;

function slugCode(prefix: string, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${base || "item"}-${Date.now().toString(36)}`;
}

const ATTACH_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const ATTACH_MAX = 5 * 1024 * 1024;

type MasterKind = "categories" | "methods" | "units";

@ApiTags("kpi")
@ApiBearerAuth()
@Controller("kpi")
export class KpiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  private async syncExpiredDrafts(where: Prisma.KpiFrameworkItemWhereInput) {
    const drafts = await this.prisma.kpiFrameworkItem.findMany({
      where: { ...where, status: "draft", isDeleted: false },
      select: { id: true, calendarYear: true, periodEndMonth: true },
    });
    const ids = drafts
      .filter((d) => isPeriodExpired(d.calendarYear, d.periodEndMonth))
      .map((d) => d.id);
    if (ids.length === 0) return;
    await this.prisma.kpiFrameworkItem.updateMany({
      where: { id: { in: ids } },
      data: { status: "pending_result" },
    });
  }

  private async actorEmployee(user: JwtPayload) {
    const emp = await this.prisma.employee.findFirst({
      where: { hrmsId: user.hrmsId, isDeleted: false },
    });
    if (!emp) throw new ForbiddenException("Employee not found for session");
    return emp;
  }

  /** Direct + indirect reports of RO (by PK), excluding self. */
  private async subtreeEmployeeIds(ownerId: bigint): Promise<bigint[]> {
    const all = await this.prisma.employee.findMany({
      where: { isDeleted: false },
      select: { id: true, resourceOwnerId: true },
    });
    const byOwner = new Map<string, bigint[]>();
    for (const e of all) {
      if (!e.resourceOwnerId) continue;
      const k = e.resourceOwnerId.toString();
      const list = byOwner.get(k) ?? [];
      list.push(e.id);
      byOwner.set(k, list);
    }
    const out: bigint[] = [];
    const queue = [ownerId];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      const kids = byOwner.get(cur.toString()) ?? [];
      for (const kid of kids) {
        const ks = kid.toString();
        if (seen.has(ks)) continue;
        seen.add(ks);
        out.push(kid);
        queue.push(kid);
      }
    }
    return out;
  }

  private mapItem(row: {
    id: bigint;
    employeeId: bigint;
    calendarYear: number;
    assessmentCycle: AssessmentCycle;
    categoryId: bigint;
    kpiName: string;
    measurementMethodId: bigint;
    unitId: bigint;
    target: DecimalValue;
    targetDirection: KpiTargetDirection;
    periodStartMonth: number;
    periodEndMonth: number;
    weightage: DecimalValue;
    status: KpiRowStatus;
    kpiResult: DecimalValue | null;
    kpiScore: DecimalValue | null;
    remarks: string | null;
    attachmentKey: string | null;
    attachmentName: string | null;
    attachmentMime: string | null;
    resultUpdatedAt: Date | null;
    resultUpdatedById: bigint | null;
    employee?: { id: bigint; hrmsId: string; name: string; departmentId: bigint | null };
    category?: { id: bigint; name: string };
    measurementMethod?: { id: bigint; name: string };
    unit?: { id: bigint; name: string };
  }) {
    return {
      id: row.id.toString(),
      employeeId: row.employeeId.toString(),
      employeeHrmsId: row.employee?.hrmsId ?? null,
      employeeName: row.employee?.name ?? null,
      departmentId: row.employee?.departmentId?.toString() ?? null,
      calendarYear: row.calendarYear,
      assessmentCycle: row.assessmentCycle,
      categoryId: row.categoryId.toString(),
      categoryName: row.category?.name ?? null,
      kpiName: row.kpiName,
      measurementMethodId: row.measurementMethodId.toString(),
      measurementMethodName: row.measurementMethod?.name ?? null,
      unitId: row.unitId.toString(),
      unitName: row.unit?.name ?? null,
      target: Number(row.target),
      targetDirection: row.targetDirection,
      periodStartMonth: row.periodStartMonth,
      periodEndMonth: row.periodEndMonth,
      periodLabel: monthsLabel(row.periodStartMonth, row.periodEndMonth, row.calendarYear),
      weightage: Number(row.weightage),
      status: row.status,
      kpiResult: row.kpiResult != null ? Number(row.kpiResult) : null,
      kpiScore: row.kpiScore != null ? Number(row.kpiScore) : null,
      remarks: row.remarks,
      hasAttachment: Boolean(row.attachmentKey),
      attachmentName: row.attachmentName,
      resultUpdatedAt: row.resultUpdatedAt?.toISOString() ?? null,
      resultUpdatedById: row.resultUpdatedById?.toString() ?? null,
      cycleExpired: isCycleExpired(row.calendarYear, row.assessmentCycle),
      periodExpired: isPeriodExpired(row.calendarYear, row.periodEndMonth),
      cycleMonths: CYCLE_MONTHS[row.assessmentCycle],
    };
  }

  // ─── Masters ─────────────────────────────────────────────────────────────

  private parseMasterKind(kind: string): MasterKind {
    if (kind !== "categories" && kind !== "methods" && kind !== "units") {
      throw new BadRequestException("kind must be categories|methods|units");
    }
    return kind;
  }

  private mapMaster(row: {
    id: bigint;
    code: string;
    name: string;
    status: "active" | "inactive";
    isActive: boolean;
  }) {
    return {
      id: row.id.toString(),
      code: row.code,
      name: row.name,
      status: row.status,
      isActive: row.isActive,
    };
  }

  @Get("masters/:kind")
  @RequirePermissions("masters.kpi_framework")
  async listMasters(
    @Param("kind") kind: string,
    @Query("includeInactive") includeInactive?: string
  ) {
    const k = this.parseMasterKind(kind);
    const where = {
      isDeleted: false,
      ...(includeInactive === "true" ? {} : { isActive: true }),
    };
    const orderBy = { name: "asc" as const };
    const rows =
      k === "categories"
        ? await this.prisma.kpiCategory.findMany({ where, orderBy })
        : k === "methods"
          ? await this.prisma.kpiMeasurementMethod.findMany({ where, orderBy })
          : await this.prisma.kpiUnitOfMeasurement.findMany({ where, orderBy });
    return rows.map((r) => this.mapMaster(r));
  }

  @Post("masters/:kind")
  @RequirePermissions("masters.kpi_framework")
  @EmitDataChange("kpi", "create")
  async createMaster(@Param("kind") kind: string, @Body() body: { name?: string }) {
    const k = this.parseMasterKind(kind);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("name is required");
    try {
      assertKpiMasterNameLength(k, name);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : "Invalid name");
    }
    const prefix = k === "categories" ? "kcat" : k === "methods" ? "kmeth" : "kunit";
    const data = { code: slugCode(prefix, name), name };

    if (k === "categories") {
      const existing = await this.prisma.kpiCategory.findFirst({ where: { name, isDeleted: false } });
      if (existing) {
        if (!existing.isActive) {
          return this.mapMaster(
            await this.prisma.kpiCategory.update({
              where: { id: existing.id },
              data: { isActive: true, status: "active", deletedAt: null },
            })
          );
        }
        return this.mapMaster(existing);
      }
      return this.mapMaster(await this.prisma.kpiCategory.create({ data }));
    }
    if (k === "methods") {
      const existing = await this.prisma.kpiMeasurementMethod.findFirst({
        where: { name, isDeleted: false },
      });
      if (existing) {
        if (!existing.isActive) {
          return this.mapMaster(
            await this.prisma.kpiMeasurementMethod.update({
              where: { id: existing.id },
              data: { isActive: true, status: "active", deletedAt: null },
            })
          );
        }
        return this.mapMaster(existing);
      }
      return this.mapMaster(await this.prisma.kpiMeasurementMethod.create({ data }));
    }
    const existing = await this.prisma.kpiUnitOfMeasurement.findFirst({
      where: { name, isDeleted: false },
    });
    if (existing) {
      if (!existing.isActive) {
        return this.mapMaster(
          await this.prisma.kpiUnitOfMeasurement.update({
            where: { id: existing.id },
            data: { isActive: true, status: "active", deletedAt: null },
          })
        );
      }
      return this.mapMaster(existing);
    }
    return this.mapMaster(await this.prisma.kpiUnitOfMeasurement.create({ data }));
  }

  @Put("masters/:kind/:id")
  @RequirePermissions("masters.kpi_framework")
  @EmitDataChange("kpi", "update")
  async updateMaster(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: { name?: string; status?: string }
  ) {
    const k = this.parseMasterKind(kind);
    const data: { name?: string; status?: "active" | "inactive"; isActive?: boolean } = {};
    if (body.name?.trim()) {
      const name = body.name.trim();
      try {
        assertKpiMasterNameLength(k, name);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : "Invalid name");
      }
      data.name = name;
    }
    if (body.status === "active" || body.status === "inactive") {
      data.status = body.status;
      data.isActive = body.status === "active";
    }
    const pk = BigInt(id);

    const assertNotUsedInFramework = async (
      currentStatus: "active" | "inactive",
      where: { categoryId?: bigint; measurementMethodId?: bigint; unitId?: bigint; isDeleted: false }
    ) => {
      if (data.status !== "inactive" || currentStatus === "inactive") return;
      const used = await this.prisma.kpiFrameworkItem.count({ where });
      if (used > 0) {
        throw new BadRequestException(
          "KPI master is used in one or more framework entries and cannot be disabled."
        );
      }
    };

    if (k === "categories") {
      const row = await this.prisma.kpiCategory.findFirst({ where: { id: pk, isDeleted: false } });
      if (!row) throw new NotFoundException("Master not found");
      await assertNotUsedInFramework(row.status, { categoryId: pk, isDeleted: false });
      return this.mapMaster(await this.prisma.kpiCategory.update({ where: { id: row.id }, data }));
    }
    if (k === "methods") {
      const row = await this.prisma.kpiMeasurementMethod.findFirst({
        where: { id: pk, isDeleted: false },
      });
      if (!row) throw new NotFoundException("Master not found");
      await assertNotUsedInFramework(row.status, { measurementMethodId: pk, isDeleted: false });
      return this.mapMaster(
        await this.prisma.kpiMeasurementMethod.update({ where: { id: row.id }, data })
      );
    }
    const row = await this.prisma.kpiUnitOfMeasurement.findFirst({
      where: { id: pk, isDeleted: false },
    });
    if (!row) throw new NotFoundException("Master not found");
    await assertNotUsedInFramework(row.status, { unitId: pk, isDeleted: false });
    return this.mapMaster(
      await this.prisma.kpiUnitOfMeasurement.update({ where: { id: row.id }, data })
    );
  }

  // ─── Framework ───────────────────────────────────────────────────────────

  @Get("framework")
  @RequirePermissions("masters.kpi_framework")
  async listFramework(
    @Query("calendarYear") calendarYear?: string,
    @Query("assessmentCycle") assessmentCycle?: string,
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("departmentId") departmentId?: string
  ) {
    const year = calendarYear ? Number(calendarYear) : undefined;
    const cycle = parseCycle(assessmentCycle);
    if (year && cycle) {
      await this.syncExpiredDrafts({
        calendarYear: year,
        assessmentCycle: cycle,
        ...(employeeHrmsId
          ? { employee: { hrmsId: employeeHrmsId, isDeleted: false } }
          : {}),
      });
    }

    let employeeId: bigint | undefined;
    if (employeeHrmsId) {
      const emp = await this.prisma.employee.findFirst({
        where: { hrmsId: employeeHrmsId, isDeleted: false },
      });
      if (!emp) return [];
      employeeId = emp.id;
    }

    const rows = await this.prisma.kpiFrameworkItem.findMany({
      where: {
        isDeleted: false,
        ...(year ? { calendarYear: year } : {}),
        ...(cycle ? { assessmentCycle: cycle } : {}),
        ...(employeeId ? { employeeId } : {}),
        ...(departmentId
          ? { employee: { departmentId: BigInt(departmentId), isDeleted: false } }
          : {}),
      },
      include: {
        employee: { select: { id: true, hrmsId: true, name: true, departmentId: true } },
        category: { select: { id: true, name: true } },
        measurementMethod: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: [{ employeeId: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => this.mapItem(r));
  }

  @Post("framework")
  @RequirePermissions("masters.kpi_framework")
  @EmitDataChange("kpi", "create")
  async createFrameworkItem(
    @Body()
    body: {
      employeeHrmsId?: string;
      calendarYear?: number;
      assessmentCycle?: string;
      categoryId?: string;
      kpiName?: string;
      measurementMethodId?: string;
      unitId?: string;
      target?: number;
      targetDirection?: string;
      periodStartMonth?: number;
      periodEndMonth?: number;
      weightage?: number;
    }
  ) {
    const cycle = parseCycle(body.assessmentCycle);
    if (!body.employeeHrmsId || !body.calendarYear || !cycle) {
      throw new BadRequestException("employeeHrmsId, calendarYear, assessmentCycle required");
    }
    if (isCycleExpired(body.calendarYear, cycle)) {
      throw new BadRequestException("Cannot add KPIs after assessment cycle has ended");
    }
    const emp = await this.prisma.employee.findFirst({
      where: { hrmsId: body.employeeHrmsId, isDeleted: false },
    });
    if (!emp) throw new NotFoundException("Employee not found");

    const periodErr = validatePeriodMonths(
      cycle,
      Number(body.periodStartMonth),
      Number(body.periodEndMonth)
    );
    if (periodErr) throw new BadRequestException(periodErr);

    const kpiName = body.kpiName?.trim();
    if (!kpiName) throw new BadRequestException("kpiName is required");
    if (!body.categoryId || !body.measurementMethodId || !body.unitId) {
      throw new BadRequestException("categoryId, measurementMethodId, unitId required");
    }
    const direction =
      body.targetDirection === "lower_is_better" ? "lower_is_better" : "higher_is_better";
    const weightage = Number(body.weightage);
    if (!Number.isFinite(weightage) || weightage < 0) {
      throw new BadRequestException("weightage must be a non-negative number");
    }

    const row = await this.prisma.kpiFrameworkItem.create({
      data: {
        employeeId: emp.id,
        calendarYear: body.calendarYear,
        assessmentCycle: cycle,
        categoryId: BigInt(body.categoryId),
        kpiName,
        measurementMethodId: BigInt(body.measurementMethodId),
        unitId: BigInt(body.unitId),
        target: new Decimal(Number(body.target) || 0),
        targetDirection: direction,
        periodStartMonth: Number(body.periodStartMonth),
        periodEndMonth: Number(body.periodEndMonth),
        weightage: new Decimal(weightage),
        status: "draft",
      },
      include: {
        employee: { select: { id: true, hrmsId: true, name: true, departmentId: true } },
        category: { select: { id: true, name: true } },
        measurementMethod: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });
    return this.mapItem(row);
  }

  @Put("framework/:id")
  @RequirePermissions("masters.kpi_framework")
  @EmitDataChange("kpi", "update")
  async updateFrameworkItem(
    @Param("id") id: string,
    @Body()
    body: {
      categoryId?: string;
      kpiName?: string;
      measurementMethodId?: string;
      unitId?: string;
      target?: number;
      targetDirection?: string;
      periodStartMonth?: number;
      periodEndMonth?: number;
      weightage?: number;
    }
  ) {
    const existing = await this.prisma.kpiFrameworkItem.findFirst({
      where: { id: BigInt(id), isDeleted: false },
    });
    if (!existing) throw new NotFoundException("KPI not found");
    if (existing.status !== "draft") {
      throw new BadRequestException("KPI framework is locked for this status");
    }
    if (isCycleExpired(existing.calendarYear, existing.assessmentCycle)) {
      throw new BadRequestException("Cannot edit KPIs after assessment cycle has ended");
    }

    const start = body.periodStartMonth ?? existing.periodStartMonth;
    const end = body.periodEndMonth ?? existing.periodEndMonth;
    const periodErr = validatePeriodMonths(existing.assessmentCycle, start, end);
    if (periodErr) throw new BadRequestException(periodErr);

    const data: Prisma.KpiFrameworkItemUpdateInput = {};
    if (body.categoryId) data.category = { connect: { id: BigInt(body.categoryId) } };
    if (body.measurementMethodId)
      data.measurementMethod = { connect: { id: BigInt(body.measurementMethodId) } };
    if (body.unitId) data.unit = { connect: { id: BigInt(body.unitId) } };
    if (body.kpiName?.trim()) data.kpiName = body.kpiName.trim();
    if (body.target !== undefined) data.target = new Decimal(Number(body.target));
    if (body.targetDirection === "higher_is_better" || body.targetDirection === "lower_is_better") {
      data.targetDirection = body.targetDirection;
    }
    if (body.periodStartMonth !== undefined) data.periodStartMonth = start;
    if (body.periodEndMonth !== undefined) data.periodEndMonth = end;
    if (body.weightage !== undefined) data.weightage = new Decimal(Number(body.weightage));

    const row = await this.prisma.kpiFrameworkItem.update({
      where: { id: existing.id },
      data,
      include: {
        employee: { select: { id: true, hrmsId: true, name: true, departmentId: true } },
        category: { select: { id: true, name: true } },
        measurementMethod: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });
    return this.mapItem(row);
  }

  @Delete("framework/:id")
  @RequirePermissions("masters.kpi_framework")
  @EmitDataChange("kpi", "delete")
  async deleteFrameworkItem(@Param("id") id: string) {
    const existing = await this.prisma.kpiFrameworkItem.findFirst({
      where: { id: BigInt(id), isDeleted: false },
    });
    if (!existing) throw new NotFoundException("KPI not found");
    if (existing.status !== "draft") {
      throw new BadRequestException("KPI framework is locked for this status");
    }
    await this.prisma.kpiFrameworkItem.update({
      where: { id: existing.id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  @Post("framework/copy")
  @RequirePermissions("masters.kpi_framework")
  @EmitDataChange("kpi", "create")
  async copyFramework(
    @Body()
    body: {
      targetEmployeeHrmsId?: string;
      sourceEmployeeHrmsId?: string;
      calendarYear?: number;
      assessmentCycle?: string;
    }
  ) {
    const cycle = parseCycle(body.assessmentCycle);
    if (!body.targetEmployeeHrmsId || !body.sourceEmployeeHrmsId || !body.calendarYear || !cycle) {
      throw new BadRequestException("target, source, year, cycle required");
    }
    if (isCycleExpired(body.calendarYear, cycle)) {
      throw new BadRequestException("Cannot copy after assessment cycle has ended");
    }
    const [target, source] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { hrmsId: body.targetEmployeeHrmsId, isDeleted: false },
      }),
      this.prisma.employee.findFirst({
        where: { hrmsId: body.sourceEmployeeHrmsId, isDeleted: false },
      }),
    ]);
    if (!target || !source) throw new NotFoundException("Employee not found");

    const existingCount = await this.prisma.kpiFrameworkItem.count({
      where: {
        employeeId: target.id,
        calendarYear: body.calendarYear,
        assessmentCycle: cycle,
        isDeleted: false,
      },
    });
    if (existingCount > 0) {
      throw new BadRequestException("Target already has KPI rows for this cycle");
    }

    const sourceRows = await this.prisma.kpiFrameworkItem.findMany({
      where: {
        employeeId: source.id,
        calendarYear: body.calendarYear,
        assessmentCycle: cycle,
        isDeleted: false,
      },
    });
    if (sourceRows.length === 0) {
      throw new BadRequestException("Source has no KPI rows for this cycle");
    }

    await this.prisma.kpiFrameworkItem.createMany({
      data: sourceRows.map((r) => ({
        employeeId: target.id,
        calendarYear: r.calendarYear,
        assessmentCycle: r.assessmentCycle,
        categoryId: r.categoryId,
        kpiName: r.kpiName,
        measurementMethodId: r.measurementMethodId,
        unitId: r.unitId,
        target: r.target,
        targetDirection: r.targetDirection,
        periodStartMonth: r.periodStartMonth,
        periodEndMonth: r.periodEndMonth,
        weightage: r.weightage,
        status: "draft" as const,
      })),
    });

    const rows = await this.prisma.kpiFrameworkItem.findMany({
      where: {
        employeeId: target.id,
        calendarYear: body.calendarYear,
        assessmentCycle: cycle,
        isDeleted: false,
      },
      include: {
        employee: { select: { id: true, hrmsId: true, name: true, departmentId: true } },
        category: { select: { id: true, name: true } },
        measurementMethod: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => this.mapItem(r));
  }

  // ─── Results (RO) ────────────────────────────────────────────────────────

  @Get("results")
  @RequirePermissions("my_team.kpi_results")
  async listResults(
    @Req() req: { user: JwtPayload },
    @Query("calendarYear") calendarYear?: string,
    @Query("assessmentCycle") assessmentCycle?: string,
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("status") status?: string
  ) {
    const actor = await this.actorEmployee(req.user);
    const year = calendarYear ? Number(calendarYear) : new Date().getUTCFullYear();
    const cycle = parseCycle(assessmentCycle) ?? "Q1";
    await this.syncExpiredDrafts({ calendarYear: year, assessmentCycle: cycle });

    let scopeIds: bigint[] | null = null;
    if (!req.user.isSuperAdmin) {
      scopeIds = await this.subtreeEmployeeIds(actor.id);
      if (scopeIds.length === 0) return { items: [], summary: emptySummary() };
    }

    let employeeId: bigint | undefined;
    if (employeeHrmsId) {
      const emp = await this.prisma.employee.findFirst({
        where: { hrmsId: employeeHrmsId, isDeleted: false },
      });
      if (!emp) return { items: [], summary: emptySummary() };
      if (scopeIds && !scopeIds.some((id) => id === emp.id)) {
        throw new ForbiddenException("Employee is outside your resource ownership");
      }
      employeeId = emp.id;
    }

    const statusFilter =
      status === "pending_result" || status === "completed" || status === "draft"
        ? (status as KpiRowStatus)
        : undefined;

    const whereBase = {
      isDeleted: false,
      calendarYear: year,
      assessmentCycle: cycle,
      ...(employeeId ? { employeeId } : scopeIds ? { employeeId: { in: scopeIds } } : {}),
      ...(departmentId
        ? { employee: { departmentId: BigInt(departmentId), isDeleted: false } }
        : {}),
    };

    // Load full scope first so tab/summary counts stay stable across status filters.
    const rows = await this.prisma.kpiFrameworkItem.findMany({
      where: whereBase,
      include: {
        employee: { select: { id: true, hrmsId: true, name: true, departmentId: true } },
        category: { select: { id: true, name: true } },
        measurementMethod: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: [{ employee: { name: "asc" } }, { id: "asc" }],
    });

    const allItems = rows.map((r) => this.mapItem(r));
    const summary = buildSummary(allItems, Boolean(employeeId));

    // "Pending" tab = not completed (draft + pending_result), matching summary.pending.
    const items =
      statusFilter === "completed"
        ? allItems.filter((i) => i.status === "completed")
        : statusFilter === "pending_result" || statusFilter === "draft"
          ? allItems.filter((i) => i.status === "pending_result" || i.status === "draft")
          : allItems;

    return { items, summary };
  }

  private async requireResultItem(req: { user: JwtPayload }, id: string) {
    const actor = await this.actorEmployee(req.user);
    const existing = await this.prisma.kpiFrameworkItem.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: { employee: true },
    });
    if (!existing) throw new NotFoundException("KPI not found");
    if (!req.user.isSuperAdmin) {
      const scope = await this.subtreeEmployeeIds(actor.id);
      if (!scope.some((x) => x === existing.employeeId)) {
        throw new ForbiddenException("Employee is outside your resource ownership");
      }
    }
    return { actor, existing };
  }

  @Get("results/:id/attachment")
  @RequirePermissions("my_team.kpi_results")
  async getResultAttachment(@Req() req: { user: JwtPayload }, @Param("id") id: string) {
    const { existing } = await this.requireResultItem(req, id);
    if (!existing.attachmentKey) throw new NotFoundException("No attachment");
    let buf: Buffer;
    try {
      buf = await this.storage.getBuffer(existing.attachmentKey);
    } catch {
      throw new NotFoundException("Attachment file not found");
    }
    const rawName = existing.attachmentName || "attachment";
    const safeName = rawName.replace(/["\r\n]+/g, "_");
    return new StreamableFile(buf, {
      type: existing.attachmentMime || "application/octet-stream",
      disposition: `inline; filename="${safeName}"`,
    });
  }

  @Delete("results/:id/attachment")
  @RequirePermissions("my_team.kpi_results")
  @EmitDataChange("kpi", "update")
  async deleteResultAttachment(@Req() req: { user: JwtPayload }, @Param("id") id: string) {
    const { existing } = await this.requireResultItem(req, id);
    if (existing.status === "completed") {
      throw new BadRequestException("KPI result is locked");
    }
    if (!existing.attachmentKey) throw new NotFoundException("No attachment");
    await this.storage.delete(existing.attachmentKey);
    await this.prisma.kpiFrameworkItem.update({
      where: { id: existing.id },
      data: { attachmentKey: null, attachmentName: null, attachmentMime: null },
    });
    return { ok: true };
  }

  @Put("results/:id")
  @RequirePermissions("my_team.kpi_results")
  @EmitDataChange("kpi", "update")
  async saveResult(
    @Req() req: { user: JwtPayload },
    @Param("id") id: string,
    @Body()
    body: {
      kpiResult?: number;
      kpiScore?: number;
      remarks?: string;
      attachment?: { fileName?: string; mimeType?: string; base64?: string } | null;
    }
  ) {
    const actor = await this.actorEmployee(req.user);
    const existing = await this.prisma.kpiFrameworkItem.findFirst({
      where: { id: BigInt(id), isDeleted: false },
      include: { employee: true },
    });
    if (!existing) throw new NotFoundException("KPI not found");

    if (!req.user.isSuperAdmin) {
      const scope = await this.subtreeEmployeeIds(actor.id);
      if (!scope.some((x) => x === existing.employeeId)) {
        throw new ForbiddenException("Employee is outside your resource ownership");
      }
    }

    if (existing.status === "completed") {
      throw new BadRequestException("KPI result is locked");
    }
    if (!isPeriodExpired(existing.calendarYear, existing.periodEndMonth)) {
      throw new BadRequestException("Results can only be submitted after the KPI period ends");
    }
    if (existing.status === "draft") {
      await this.prisma.kpiFrameworkItem.update({
        where: { id: existing.id },
        data: { status: "pending_result" },
      });
    }

    const score = Number(body.kpiScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new BadRequestException("kpiScore must be between 0.00 and 100.00");
    }
    const resultVal = Number(body.kpiResult);
    if (!Number.isFinite(resultVal)) {
      throw new BadRequestException("kpiResult must be numeric");
    }

    let attachmentKey = existing.attachmentKey;
    let attachmentName = existing.attachmentName;
    let attachmentMime = existing.attachmentMime;

    if (body.attachment === null) {
      attachmentKey = null;
      attachmentName = null;
      attachmentMime = null;
    } else if (body.attachment?.base64) {
      const mime = body.attachment.mimeType || "application/octet-stream";
      if (!ATTACH_MIME.has(mime) && !mime.startsWith("image/jpeg")) {
        throw new BadRequestException("Attachment must be PDF, XLSX, JPG, or JPEG");
      }
      const buf = Buffer.from(body.attachment.base64, "base64");
      if (buf.length > ATTACH_MAX) {
        throw new BadRequestException("Attachment must be 5 MB or less");
      }
      const safeName = (body.attachment.fileName || "attachment").replace(/[^\w.-]+/g, "_");
      const key = `kpi-attachments/${existing.id}/${Date.now()}-${safeName}`;
      await this.storage.put(key, buf, { contentType: mime });
      attachmentKey = key;
      attachmentName = body.attachment.fileName || safeName;
      attachmentMime = mime;
    }

    const remarks = body.remarks?.trim() || null;
    if (remarks && remarks.length > KPI_RO_REMARKS_MAX) {
      throw new BadRequestException(
        `Resource Owner Remarks cannot exceed ${KPI_RO_REMARKS_MAX} characters`
      );
    }

    const row = await this.prisma.kpiFrameworkItem.update({
      where: { id: existing.id },
      data: {
        kpiResult: new Decimal(resultVal),
        kpiScore: new Decimal(score),
        remarks,
        attachmentKey,
        attachmentName,
        attachmentMime,
        status: "completed",
        resultUpdatedAt: new Date(),
        resultUpdatedById: actor.id,
      },
      include: {
        employee: { select: { id: true, hrmsId: true, name: true, departmentId: true } },
        category: { select: { id: true, name: true } },
        measurementMethod: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });
    return this.mapItem(row);
  }
}

function emptySummary() {
  return { total: 0, pending: 0, completed: 0, finalAchievement: null as number | null };
}

function buildSummary(
  items: { status: string; kpiScore: number | null; weightage: number }[],
  resourceSelected: boolean
) {
  const total = items.length;
  const pending = items.filter((i) => i.status === "pending_result" || i.status === "draft").length;
  const completed = items.filter((i) => i.status === "completed").length;
  let finalAchievement: number | null = null;
  if (resourceSelected && total > 0 && completed === total) {
    const sum = items.reduce((acc, i) => acc + (Number(i.kpiScore) || 0) * Number(i.weightage), 0);
    finalAchievement = Math.round((sum / 100) * 100) / 100;
  }
  return { total, pending, completed, finalAchievement };
}
