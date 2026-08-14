import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { HashingService } from "@oneview/security";
import { MailService } from "@oneview/mail";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RequirePermissions } from "../auth/guards";
import { SessionAuthCache } from "../auth/session-auth.cache";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

/** Legacy default when SMTP welcome flow is not enabled */
const DEFAULT_PIN = "12345";

const WEAK_PINS = new Set(["00000", "11111", "22222", "33333", "44444", "55555", "66666", "77777", "88888", "99999", "12345", "54321", "01234", "98765"]);

function isWeakPin(pin: string) {
  return WEAK_PINS.has(pin) || /^(\d)\1{4}$/.test(pin);
}

/** Cryptographically random 5-digit PIN; excludes trivial patterns. Never log the result. */
function generateSecurePin(): string {
  for (let i = 0; i < 64; i++) {
    const pin = String(randomInt(0, 100_000)).padStart(5, "0");
    if (!isWeakPin(pin)) return pin;
  }
  return String(randomInt(10_000, 100_000));
}

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
  private readonly logger = new Logger(EmployeesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly mail: MailService,
    private readonly sessionAuthCache: SessionAuthCache
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
    _count?: {
      allocations?: number;
      workConfirmations?: number;
      weeklyCheckIns?: number;
      kpiFrameworkItems?: number;
    };
  }, transactionCountOverride?: number) {
    const c = e._count;
    const transactionCount =
      transactionCountOverride ??
      (c?.allocations ?? 0) +
        (c?.workConfirmations ?? 0) +
        (c?.weeklyCheckIns ?? 0) +
        (c?.kpiFrameworkItems ?? 0);
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
      transactionCount,
    };
  }

  /** Fast boolean flags for Disable UI — one EXISTS scan, not 4× per-row _count. */
  private async transactionFlagByEmployeeId(): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; has_tx: boolean }>>`
      SELECT e.id::text AS id,
        (
          EXISTS (
            SELECT 1 FROM allocations a
            WHERE a.employee_id = e.id AND a.is_deleted = false
          )
          OR EXISTS (
            SELECT 1 FROM work_confirmations w
            WHERE w.employee_id = e.id AND w.is_deleted = false
          )
          OR EXISTS (
            SELECT 1 FROM weekly_check_in_submissions wci
            WHERE wci.employee_id = e.id AND wci.is_deleted = false
          )
          OR EXISTS (
            SELECT 1 FROM kpi_framework_items k
            WHERE k.employee_id = e.id AND k.is_deleted = false
          )
        ) AS has_tx
      FROM employees e
      WHERE e.is_deleted = false
    `;
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.id, r.has_tx ? 1 : 0);
    }
    return map;
  }

  private async transactionCountForEmployee(employeeId: bigint): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ has_tx: boolean }>>`
      SELECT (
        EXISTS (
          SELECT 1 FROM allocations a
          WHERE a.employee_id = ${employeeId} AND a.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM work_confirmations w
          WHERE w.employee_id = ${employeeId} AND w.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM weekly_check_in_submissions wci
          WHERE wci.employee_id = ${employeeId} AND wci.is_deleted = false
        )
        OR EXISTS (
          SELECT 1 FROM kpi_framework_items k
          WHERE k.employee_id = ${employeeId} AND k.is_deleted = false
        )
      ) AS has_tx
    `;
    return rows[0]?.has_tx ? 1 : 0;
  }

  private async findEmp(id: string) {
    return this.prisma.employee.findFirst({
      where: {
        isDeleted: false,
        OR: /^\d+$/.test(id) ? [{ id: BigInt(id) }, { hrmsId: id }] : [{ hrmsId: id }],
      },
    });
  }

  /** Welcome PIN email only when SMTP is saved and Test Connection succeeded. */
  private async isWelcomeEmailEnabled(): Promise<boolean> {
    if (!this.mail.isProductConfigured()) return false;
    const row = await this.prisma.smtpSettings.findFirst({
      where: { code: "default", isDeleted: false },
    });
    return Boolean(row?.isConfigured && row?.connectionVerified);
  }

  private async sendWelcomePinEmail(params: {
    employeeId: bigint;
    name: string;
    email: string;
    hrmsId: string;
    plainPin: string;
  }): Promise<{ sent: boolean; message: string }> {
    const appUrl = (process.env.APP_PUBLIC_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
    const loginUrl = `${appUrl}/login`;
    const text = [
      `Hi ${params.name},`,
      "",
      "Welcome to Warin.",
      "",
      `Your user ID (HRMS): ${params.hrmsId}`,
      `Login email: ${params.email}`,
      `Temporary PIN: ${params.plainPin}`,
      "",
      `Sign in at: ${loginUrl}`,
      "",
      "You must change this temporary PIN on your first login before using the application.",
      "",
      "If you did not expect this account, contact your administrator.",
    ].join("\n");
    const html = `
      <p>Hi ${params.name},</p>
      <p>Welcome to <strong>Warin</strong>.</p>
      <p><strong>User ID (HRMS):</strong> ${params.hrmsId}<br/>
      <strong>Login email:</strong> ${params.email}<br/>
      <strong>Temporary PIN:</strong> ${params.plainPin}</p>
      <p><a href="${loginUrl}">Sign in to Warin</a></p>
      <p style="color:#666;font-size:13px">You must change this temporary PIN on your first login before using the application.</p>
    `;
    try {
      await this.mail.send({
        to: params.email,
        subject: "Welcome to Warin — your temporary PIN",
        text,
        html,
        template: "welcome-pin",
        context: { name: params.name, hrmsId: params.hrmsId, loginUrl },
      });
      await this.prisma.welcomePinEmailLog.create({
        data: {
          employeeId: params.employeeId,
          toEmail: params.email,
          status: "sent",
        },
      });
      return { sent: true, message: `Welcome email with temporary PIN sent to ${params.email}.` };
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Mail send failed";
      this.logger.warn(`Welcome PIN email failed for employee ${params.employeeId}: ${detail}`);
      await this.prisma.welcomePinEmailLog.create({
        data: {
          employeeId: params.employeeId,
          toEmail: params.email,
          status: "failed",
          errorMessage: detail.slice(0, 500),
        },
      });
      return {
        sent: false,
        message: `Employee created, but welcome email failed: ${detail}`,
      };
    }
  }

  @Get()
  // WCI reviewers + planner/availability/reports need roster; write ops stay employees-only.
  @RequirePermissions(
    "employees",
    "my_team.weekly_check_in",
    "planner",
    "availability",
    "reports.deployment",
    "reports.performance",
    "reports.execution",
    "reports.daily_work"
  )
  async list(@Query("status") status?: string) {
    const [rows, txFlags] = await Promise.all([
      this.prisma.employee.findMany({
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
      }),
      this.transactionFlagByEmployeeId(),
    ]);
    return ser(
      rows.map((e) => this.mapRow(e, txFlags.get(e.id.toString()) ?? 0))
    );
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
    const transactionCount = await this.transactionCountForEmployee(e.id);
    return ser({
      ...this.mapRow(e, transactionCount),
      permissionKeys: e.permissions.map((p) => p.key),
    });
  }

  @Post()
  @RequirePermissions("employees")
  @EmitDataChange("employees", "create")
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

    const welcomeEnabled = await this.isWelcomeEmailEnabled();
    const plainPin = welcomeEnabled ? generateSecurePin() : DEFAULT_PIN;
    const mustChangePin = welcomeEnabled;
    const pinHash = await this.hashing.hash(plainPin);
    const status = body.status === "inactive" ? "inactive" : "active";

    const created = await this.prisma.employee.create({
      data: {
        hrmsId,
        name,
        email,
        pinHash,
        mustChangePin,
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

    let welcomeEmailSent = false;
    let welcomeEmailSkipped = !welcomeEnabled;
    let welcomeEmailMessage: string | undefined;

    if (welcomeEnabled) {
      const result = await this.sendWelcomePinEmail({
        employeeId: created.id,
        name: created.name,
        email: created.email,
        hrmsId: created.hrmsId,
        plainPin,
      });
      welcomeEmailSent = result.sent;
      welcomeEmailSkipped = false;
      welcomeEmailMessage = result.message;
    } else {
      welcomeEmailMessage =
        "SMTP is not configured or Test Connection has not succeeded — welcome email was not sent. Employee uses the standard registration PIN.";
    }

    // Never include plainPin in the API response
    return ser({
      ...this.mapRow(created, 0),
      welcomeEmailSent,
      welcomeEmailSkipped,
      welcomeEmailMessage,
      mustChangePin,
    });
  }

  @Put(":id")
  @RequirePermissions("employees")
  @EmitDataChange("employees", "update")
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

    if (status === "inactive" && emp.status !== "inactive") {
      const linked = await this.transactionCountForEmployee(emp.id);
      if (linked > 0) {
        throw new BadRequestException(
          "Employee is associated with one or more transactions and cannot be disabled."
        );
      }
    }

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

    if (status === "inactive") {
      this.sessionAuthCache.invalidate(emp.id);
    }

    const transactionCount = await this.transactionCountForEmployee(updated.id);
    return ser(this.mapRow(updated, transactionCount));
  }
}
