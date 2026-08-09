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
import type { CompetencyKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { RequirePermissions } from "../auth/guards";
import { EmitDataChange } from "../realtime/emit-data-change.decorator";

function ser<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as T;
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const DEFAULT_RANKING = [
  { value: 5, title: "Exceptional", color: "success" },
  { value: 4, title: "Strong", color: "accent" },
  { value: 3, title: "Solid", color: "warning" },
  { value: 2, title: "Developing", color: "danger-soft" },
  { value: 1, title: "Needs Focus", color: "danger" },
];

const DEFAULT_ACTIONS = ["None", "Coaching", "Training", "Process Change", "Escalation"];

const SEED_COMPS: Record<string, { technical: string[]; behavioural: string[] }> = {
  "dept-1": {
    technical: ["Code Quality", "System Design", "API Integration", "Defect Detection"],
    behavioural: ["Ownership", "Collaboration", "Communication", "Initiative"],
  },
  "dept-2": {
    technical: ["Test Automation", "Defect Detection", "API Testing"],
    behavioural: ["Attention to Detail", "Ownership", "Collaboration"],
  },
  "dept-3": {
    technical: ["Visual Design", "UX Research", "Prototyping"],
    behavioural: ["Stakeholder Communication", "Creativity", "Collaboration"],
  },
  "dept-4": {
    technical: ["Infrastructure Reliability", "CI/CD Practices", "Security Hygiene"],
    behavioural: ["Incident Response", "Documentation", "Collaboration"],
  },
  "dept-5": {
    technical: [
      "Ticket Triage",
      "Root-Cause Diagnosis",
      "Knowledge Base Quality",
      "SLA Adherence",
      "Product / Domain Knowledge",
    ],
    behavioural: ["Empathy", "Clear Communication", "Escalation Judgment", "Patience", "Ownership"],
  },
};

/** Extra seed keyed by department display name (e.g. user-created Admin). */
const SEED_COMPS_BY_NAME: Record<string, { technical: string[]; behavioural: string[] }> = {
  Admin: {
    technical: [
      "Process Compliance",
      "Documentation Accuracy",
      "Tool / System Admin",
      "Access & Audit Hygiene",
      "Reporting Discipline",
    ],
    behavioural: [
      "Confidentiality",
      "Responsiveness",
      "Stakeholder Service",
      "Prioritization",
      "Ownership",
    ],
  },
  Support: SEED_COMPS["dept-5"]!,
};

type SubmitBody = {
  employeeHrmsId: string;
  weekStart: string;
  evidence: Record<string, unknown>;
  technicalRatings: Record<string, number>;
  behaviouralRatings: Record<string, number>;
  weeklyStatus: string;
  confidence: string;
  roRemarks: string;
  actionType: string;
  actionNotes?: string;
  previousActionStatus?: string;
  recognition: string;
};

type ConfigBody = {
  rankingLevels: { value: number; title: string; color: string }[];
  actionTypes: string[];
  competencies: {
    code: string;
    /** Department BIGINT PK as string (preferred). Legacy: department business code. */
    departmentId: string;
    kind: CompetencyKind;
    label: string;
    remark?: string;
    sequence: number;
  }[];
};

@ApiTags("weekly-check-in")
@ApiBearerAuth()
@Controller("weekly-check-in")
export class WeeklyCheckInController {
  constructor(private readonly prisma: PrismaService) {}

  private async empByHrms(hrmsId: string) {
    const e = await this.prisma.employee.findFirst({
      where: { hrmsId, isDeleted: false },
    });
    if (!e) throw new BadRequestException(`Employee not found: ${hrmsId}`);
    return e;
  }

  private mapSubmission(s: {
    id: bigint;
    weekStart: Date;
    evidence: Prisma.JsonValue;
    technicalRatings: Prisma.JsonValue;
    behaviouralRatings: Prisma.JsonValue;
    weeklyStatus: string;
    confidence: string;
    roRemarks: string;
    actionType: string;
    actionNotes: string | null;
    previousActionStatus: string | null;
    recognition: string;
    submittedAt: Date;
    actionOutcome: string | null;
    employee: { hrmsId: string; name: string };
    resourceOwner: { hrmsId: string };
    submittedBy: { hrmsId: string };
  }) {
    return {
      id: s.id.toString(),
      employeeId: s.employee.hrmsId,
      employeeName: s.employee.name,
      resourceOwnerId: s.resourceOwner.hrmsId,
      weekStart: isoDate(s.weekStart),
      evidence: s.evidence,
      technicalRatings: s.technicalRatings,
      behaviouralRatings: s.behaviouralRatings,
      weeklyStatus: s.weeklyStatus,
      confidence: s.confidence,
      roRemarks: s.roRemarks,
      actionType: s.actionType,
      actionNotes: s.actionNotes ?? undefined,
      previousActionStatus: s.previousActionStatus ?? undefined,
      recognition: s.recognition,
      submittedAt: s.submittedAt.toISOString(),
      submittedByEmployeeId: s.submittedBy.hrmsId,
      actionOutcome: s.actionOutcome ?? undefined,
    };
  }

  private async resolveDepartmentId(ref: string): Promise<bigint> {
    const trimmed = ref?.trim();
    if (!trimmed) throw new BadRequestException("departmentId is required");
    if (/^\d+$/.test(trimmed)) {
      const byId = await this.prisma.department.findFirst({
        where: { id: BigInt(trimmed), isDeleted: false },
      });
      if (byId) return byId.id;
    }
    const byCode = await this.prisma.department.findFirst({
      where: { code: trimmed, isDeleted: false },
    });
    if (byCode) return byCode.id;
    throw new BadRequestException(`Department not found: ${trimmed}`);
  }

  private async seedCompetenciesForDepartment(
    departmentId: bigint,
    codePrefix: string,
    lists: { technical: string[]; behavioural: string[] }
  ) {
    const active = await this.prisma.weeklyCheckInCompetency.count({
      where: { departmentId, isDeleted: false },
    });
    if (active > 0) return;

    const creates: {
      code: string;
      departmentId: bigint;
      kind: CompetencyKind;
      label: string;
      sequence: number;
    }[] = [];
    lists.technical.forEach((label, i) => {
      creates.push({
        code: `comp-${codePrefix}-t-${i + 1}`,
        departmentId,
        kind: "technical",
        label,
        sequence: i + 1,
      });
    });
    lists.behavioural.forEach((label, i) => {
      creates.push({
        code: `comp-${codePrefix}-b-${i + 1}`,
        departmentId,
        kind: "behavioural",
        label,
        sequence: i + 1,
      });
    });

    for (const row of creates) {
      const existing = await this.prisma.weeklyCheckInCompetency.findUnique({
        where: { code: row.code },
      });
      if (existing) {
        await this.prisma.weeklyCheckInCompetency.update({
          where: { code: row.code },
          data: {
            departmentId: row.departmentId,
            kind: row.kind,
            label: row.label,
            sequence: row.sequence,
            isDeleted: false,
            isActive: true,
            deletedAt: null,
            version: { increment: 1 },
          },
        });
      } else {
        await this.prisma.weeklyCheckInCompetency.create({ data: row });
      }
    }
  }

  private async ensureSettings() {
    let row = await this.prisma.weeklyCheckInSettings.findFirst({
      where: { code: "default", isDeleted: false },
    });
    if (!row) {
      row = await this.prisma.weeklyCheckInSettings.create({
        data: {
          code: "default",
          rankingLevels: DEFAULT_RANKING,
          actionTypes: DEFAULT_ACTIONS,
        },
      });
    }

    const compCount = await this.prisma.weeklyCheckInCompetency.count({
      where: { isDeleted: false },
    });
    if (compCount === 0) {
      const depts = await this.prisma.department.findMany({
        where: { isDeleted: false, code: { in: Object.keys(SEED_COMPS) } },
      });
      const deptByCode = new Map(depts.map((d) => [d.code, d.id]));
      for (const [deptCode, lists] of Object.entries(SEED_COMPS)) {
        const departmentId = deptByCode.get(deptCode);
        if (!departmentId) continue;
        await this.seedCompetenciesForDepartment(departmentId, deptCode, lists);
      }
    }

    // Fill Admin / Support (and any named extras) when those departments have no active comps.
    for (const [name, lists] of Object.entries(SEED_COMPS_BY_NAME)) {
      const dept = await this.prisma.department.findFirst({
        where: { name, isDeleted: false },
      });
      if (!dept) continue;
      const prefix = dept.code.startsWith("dept-") ? dept.code : `dept-${name.toLowerCase()}`;
      await this.seedCompetenciesForDepartment(dept.id, prefix, lists);
    }

    return row;
  }

  @Get("config")
  @RequirePermissions("my_team.weekly_check_in", "masters.weekly_check_in")
  async getConfig() {
    const settings = await this.ensureSettings();
    const comps = await this.prisma.weeklyCheckInCompetency.findMany({
      where: { isDeleted: false },
      orderBy: [{ departmentId: "asc" }, { kind: "asc" }, { sequence: "asc" }],
    });
    const byDept: Record<
      string,
      { id: string; departmentId: string; kind: string; label: string; remark: string; sequence: number }[]
    > = {};
    for (const c of comps) {
      const deptKey = c.departmentId.toString();
      const list = byDept[deptKey] ?? [];
      list.push({
        id: c.code,
        departmentId: deptKey,
        kind: c.kind,
        label: c.label,
        remark: c.remark ?? "",
        sequence: c.sequence,
      });
      byDept[deptKey] = list;
    }
    return ser({
      rankingLevels: settings.rankingLevels,
      actionTypes: settings.actionTypes,
      competenciesByDepartment: byDept,
    });
  }

  @Put("config")
  @RequirePermissions("my_team.weekly_check_in", "masters.weekly_check_in")
  @EmitDataChange("weekly-check-in", "update")
  async putConfig(@Body() body: ConfigBody) {
    await this.ensureSettings();
    await this.prisma.weeklyCheckInSettings.update({
      where: { code: "default" },
      data: {
        rankingLevels: body.rankingLevels ?? DEFAULT_RANKING,
        actionTypes: body.actionTypes?.length ? body.actionTypes : DEFAULT_ACTIONS,
        version: { increment: 1 },
      },
    });

    if (Array.isArray(body.competencies)) {
      await this.prisma.weeklyCheckInCompetency.updateMany({
        where: { isDeleted: false },
        data: { isDeleted: true, isActive: false, deletedAt: new Date() },
      });
      for (const c of body.competencies) {
        const departmentId = await this.resolveDepartmentId(c.departmentId);
        const existing = await this.prisma.weeklyCheckInCompetency.findUnique({
          where: { code: c.code },
        });
        if (existing) {
          await this.prisma.weeklyCheckInCompetency.update({
            where: { code: c.code },
            data: {
              departmentId,
              kind: c.kind,
              label: c.label,
              remark: (c.remark ?? "").trim(),
              sequence: c.sequence,
              isDeleted: false,
              isActive: true,
              deletedAt: null,
              version: { increment: 1 },
            },
          });
        } else {
          await this.prisma.weeklyCheckInCompetency.create({
            data: {
              code: c.code,
              departmentId,
              kind: c.kind,
              label: c.label,
              remark: (c.remark ?? "").trim(),
              sequence: c.sequence,
            },
          });
        }
      }
    }
    return this.getConfig();
  }

  @Get("submissions")
  @RequirePermissions("my_team.weekly_check_in")
  async list(
    @Query("weekStart") weekStart?: string,
    @Query("employeeHrmsId") employeeHrmsId?: string,
    @Query("resourceOwnerHrmsId") resourceOwnerHrmsId?: string
  ) {
    const rows = await this.prisma.weeklyCheckInSubmission.findMany({
      where: {
        isDeleted: false,
        ...(weekStart ? { weekStart: parseDate(weekStart)! } : {}),
        ...(employeeHrmsId
          ? { employee: { hrmsId: employeeHrmsId, isDeleted: false } }
          : {}),
        ...(resourceOwnerHrmsId
          ? { resourceOwner: { hrmsId: resourceOwnerHrmsId, isDeleted: false } }
          : {}),
      },
      include: {
        employee: { select: { hrmsId: true, name: true } },
        resourceOwner: { select: { hrmsId: true } },
        submittedBy: { select: { hrmsId: true } },
      },
      orderBy: [{ weekStart: "desc" }, { id: "desc" }],
    });
    return ser(rows.map((r) => this.mapSubmission(r)));
  }

  @Get("submissions/:employeeHrmsId/:weekStart")
  @RequirePermissions("my_team.weekly_check_in")
  async one(
    @Param("employeeHrmsId") employeeHrmsId: string,
    @Param("weekStart") weekStart: string
  ) {
    const emp = await this.empByHrms(employeeHrmsId);
    const ws = parseDate(weekStart);
    if (!ws) throw new BadRequestException("Invalid weekStart");
    const row = await this.prisma.weeklyCheckInSubmission.findFirst({
      where: { employeeId: emp.id, weekStart: ws, isDeleted: false },
      include: {
        employee: { select: { hrmsId: true, name: true } },
        resourceOwner: { select: { hrmsId: true } },
        submittedBy: { select: { hrmsId: true } },
      },
    });
    if (!row) return ser(null);
    return ser(this.mapSubmission(row));
  }

  @Post("submissions")
  @RequirePermissions("my_team.weekly_check_in")
  @EmitDataChange("weekly-check-in", "update")
  async submit(@Req() req: { user: JwtPayload }, @Body() body: SubmitBody) {
    const submitter = await this.empByHrms(req.user.hrmsId);
    const employee = await this.empByHrms(body.employeeHrmsId);
    const weekStart = parseDate(body.weekStart);
    if (!weekStart) throw new BadRequestException("weekStart is required");
    if (!body.roRemarks?.trim() || body.roRemarks.trim().length < 100) {
      throw new BadRequestException("Remarks must be at least 100 characters");
    }

    const ownerId = employee.resourceOwnerId ?? submitter.id;
    const existing = await this.prisma.weeklyCheckInSubmission.findFirst({
      where: { employeeId: employee.id, weekStart },
    });
    if (existing && !existing.isDeleted) {
      throw new BadRequestException("Check-in already submitted for this week");
    }

    const payload = {
      employeeId: employee.id,
      resourceOwnerId: ownerId,
      weekStart,
      evidence: body.evidence as Prisma.InputJsonValue,
      technicalRatings: body.technicalRatings as Prisma.InputJsonValue,
      behaviouralRatings: body.behaviouralRatings as Prisma.InputJsonValue,
      weeklyStatus: body.weeklyStatus,
      confidence: body.confidence,
      roRemarks: body.roRemarks.trim(),
      actionType: body.actionType,
      actionNotes:
        body.actionType !== "None" ? body.actionNotes?.trim() || null : null,
      previousActionStatus: body.previousActionStatus ?? null,
      recognition: body.recognition,
      submittedAt: new Date(),
      submittedById: submitter.id,
      actionOutcome: body.actionType !== "None" ? "Still Pending" : null,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    };

    const created = existing
      ? await this.prisma.weeklyCheckInSubmission.update({
          where: { id: existing.id },
          data: { ...payload, version: { increment: 1 } },
          include: {
            employee: { select: { hrmsId: true, name: true } },
            resourceOwner: { select: { hrmsId: true } },
            submittedBy: { select: { hrmsId: true } },
          },
        })
      : await this.prisma.weeklyCheckInSubmission.create({
          data: payload,
          include: {
            employee: { select: { hrmsId: true, name: true } },
            resourceOwner: { select: { hrmsId: true } },
            submittedBy: { select: { hrmsId: true } },
          },
        });

    if (body.previousActionStatus) {
      const prevWeek = parseDate(addDaysISO(body.weekStart, -7));
      if (prevWeek) {
        await this.prisma.weeklyCheckInSubmission.updateMany({
          where: {
            employeeId: employee.id,
            weekStart: prevWeek,
            isDeleted: false,
          },
          data: { actionOutcome: body.previousActionStatus, version: { increment: 1 } },
        });
      }
    }

    return ser(this.mapSubmission(created));
  }

  @Get("queue")
  @RequirePermissions("my_team.weekly_check_in")
  async queue(
    @Req() req: { user: JwtPayload },
    @Query("weekStart") weekStartQ?: string
  ) {
    const reviewer = await this.empByHrms(req.user.hrmsId);
    const weekStart = mondayOf(weekStartQ ?? todayLocalISO());
    const prevWeek = addDaysISO(weekStart, -7);
    const ws = parseDate(weekStart)!;
    const pws = parseDate(prevWeek)!;

    const reports = await this.prisma.employee.findMany({
      where: {
        isDeleted: false,
        status: "active",
        OR: [
          { resourceOwnerId: reviewer.id },
          ...(req.user.isSuperAdmin
            ? [{ NOT: { id: reviewer.id } }]
            : []),
        ],
      },
      include: {
        department: true,
        skills: { include: { skill: true }, take: 1 },
      },
      orderBy: { name: "asc" },
    });

    // Deduplicate if superadmin also owns some
    const seen = new Set<string>();
    const roster = reports.filter((e) => {
      const k = e.hrmsId;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const submissions = await this.prisma.weeklyCheckInSubmission.findMany({
      where: {
        isDeleted: false,
        employeeId: { in: roster.map((e) => e.id) },
        weekStart: { in: [ws, pws] },
      },
      include: {
        employee: { select: { hrmsId: true, name: true } },
        resourceOwner: { select: { hrmsId: true } },
        submittedBy: { select: { hrmsId: true } },
      },
    });

    const byEmpWeek = new Map<string, (typeof submissions)[0]>();
    for (const s of submissions) {
      byEmpWeek.set(`${s.employee.hrmsId}:${isoDate(s.weekStart)}`, s);
    }

    const rows = roster.map((e) => {
      const current = byEmpWeek.get(`${e.hrmsId}:${weekStart}`);
      const prev = byEmpWeek.get(`${e.hrmsId}:${prevWeek}`);
      const evidence = current?.evidence as { confirmationDiscipline?: number | null; noOperationalData?: boolean } | undefined;
      return {
        employeeId: e.hrmsId,
        employeeName: e.name,
        department: e.department?.name ?? "—",
        role: e.skills[0]?.skill.name ?? "—",
        initials: e.name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join(""),
        status: current ? ("completed" as const) : ("pending" as const),
        submissionId: current?.id.toString(),
        lastWeekStatus: prev?.weeklyStatus,
        confirmationDiscipline: evidence?.confirmationDiscipline ?? null,
        openActionType:
          prev?.actionType && prev.actionType !== "None" && prev.actionOutcome !== "Completed"
            ? prev.actionType
            : undefined,
        openActionNotes: prev?.actionNotes ?? undefined,
        prevRecognition: prev?.recognition,
        prevActionCompleted: prev?.actionOutcome === "Completed",
        submittedAt: current?.submittedAt.toISOString(),
        weeklyStatus: current?.weeklyStatus,
        recognition: current?.recognition,
        noPriorReview: !prev,
        noOperationalData: evidence?.noOperationalData ?? true,
      };
    });

    return ser({ weekStart, rows });
  }
}
