import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { HashingService } from "@oneview/security";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SessionAuthCache } from "../auth/session-auth.cache";
import type { JwtPayload } from "../auth/jwt.strategy";

const TX_OPTS = { maxWait: 10_000, timeout: 60_000 } as const;

@Injectable()
export class HardDeleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly sessionAuthCache: SessionAuthCache
  ) {}

  /**
   * Super-admin only. Email must match the signed-in admin; PIN must verify.
   * Invalid credentials do not proceed to deletion.
   */
  async assertAdminCredentials(user: JwtPayload, email: string, pin: string): Promise<void> {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException("Administrator access required");
    }
    const expected = user.email.trim().toLowerCase();
    const given = email.trim().toLowerCase();
    if (!given || given !== expected) {
      throw new UnauthorizedException("Invalid login credentials");
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(user.sub), isDeleted: false, isActive: true },
    });
    if (!employee) throw new UnauthorizedException("Invalid login credentials");
    const ok = await this.hashing.verify(employee.pinHash, pin);
    if (!ok) throw new UnauthorizedException("Invalid login credentials");
  }

  async deleteEmployee(user: JwtPayload, hrmsId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { isDeleted: false, hrmsId: hrmsId.trim() },
    });
    if (!emp) throw new NotFoundException("Employee not found");
    if (emp.id.toString() === user.sub) {
      throw new ForbiddenException("You cannot hard-delete your own account");
    }
    if (emp.isSuperAdmin) {
      throw new ForbiddenException("Administrator accounts cannot be hard-deleted");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { employeeId: emp.id } });
      await tx.employee.updateMany({
        where: { resourceOwnerId: emp.id },
        data: { resourceOwnerId: null },
      });
      // No onDelete on KPI updater FK — clear before employee row is removed.
      await tx.kpiFrameworkItem.updateMany({
        where: { resultUpdatedById: emp.id },
        data: { resultUpdatedById: null },
      });
      await this.purgeEmployeeTransactions(tx, emp.id);
      await tx.employee.delete({ where: { id: emp.id } });
    }, TX_OPTS);

    this.sessionAuthCache.invalidate(emp.id);
    return { ok: true, message: `${emp.name} was permanently deleted.` };
  }

  async deleteProject(projectCode: string) {
    const row = await this.prisma.project.findFirst({
      where: { isDeleted: false, projectCode: projectCode.trim() },
    });
    if (!row) throw new NotFoundException("Project not found");

    await this.prisma.$transaction(async (tx) => {
      await this.detachAndDeleteAllocations(tx, { projectId: row.id });
      await tx.projectDemandLine.deleteMany({ where: { projectId: row.id } });
      await tx.projectMilestone.deleteMany({ where: { projectId: row.id } });
      await tx.project.delete({ where: { id: row.id } });
    }, TX_OPTS);

    return { ok: true, message: `${row.name} was permanently deleted.` };
  }

  async deleteDepartment(code: string) {
    const row = await this.prisma.department.findFirst({
      where: { isDeleted: false, code: code.trim() },
    });
    if (!row) throw new NotFoundException("Department not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.weeklyCheckInCompetency.deleteMany({ where: { departmentId: row.id } });
      await tx.employee.updateMany({
        where: { departmentId: row.id },
        data: { departmentId: null },
      });
      await tx.department.delete({ where: { id: row.id } });
    }, TX_OPTS);

    return { ok: true, message: `${row.name} was permanently deleted.` };
  }

  async deleteSkill(code: string) {
    const row = await this.prisma.skill.findFirst({
      where: { isDeleted: false, code: code.trim() },
    });
    if (!row) throw new NotFoundException("Skill not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeSkill.deleteMany({ where: { skillId: row.id } });
      await tx.skill.delete({ where: { id: row.id } });
    }, TX_OPTS);

    return { ok: true, message: `${row.name} was permanently deleted.` };
  }

  async deleteActivity(code: string) {
    const row = await this.prisma.activity.findFirst({
      where: { isDeleted: false, code: code.trim() },
    });
    if (!row) throw new NotFoundException("Activity not found");

    await this.prisma.$transaction(async (tx) => {
      await this.detachAndDeleteAllocations(tx, { activityId: row.id });
      await tx.activity.delete({ where: { id: row.id } });
    }, TX_OPTS);

    return { ok: true, message: `${row.name} was permanently deleted.` };
  }

  /**
   * Remove all employee-scoped transaction rows before the employee master row.
   * Focus sessions/laps cascade when productivity days are deleted; confirmation lines
   * cascade when work confirmations are deleted.
   */
  private async purgeEmployeeTransactions(
    tx: Prisma.TransactionClient,
    employeeId: bigint
  ) {
    await tx.confirmationProductivityDay.deleteMany({ where: { employeeId } });
    await tx.workConfirmation.deleteMany({ where: { employeeId } });
    await tx.weeklyCheckInSubmission.deleteMany({
      where: {
        OR: [
          { employeeId },
          { resourceOwnerId: employeeId },
          { submittedById: employeeId },
        ],
      },
    });
    await tx.kpiFrameworkItem.deleteMany({ where: { employeeId } });
    await this.detachAndDeleteAllocations(tx, { employeeId });
  }

  /**
   * Hard-delete allocations and every confirmation/focus row tied to them.
   * (Previously only nulled FKs, which left orphan productivity / confirmation evidence.)
   */
  private async detachAndDeleteAllocations(
    tx: Prisma.TransactionClient,
    where: { employeeId?: bigint; projectId?: bigint; activityId?: bigint }
  ) {
    const rows = await tx.allocation.findMany({ where, select: { id: true } });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return;

    const keys = ids.map((id) => id.toString());
    const confirmationIds = (
      await tx.workConfirmationLine.findMany({
        where: { allocationId: { in: ids } },
        select: { confirmationId: true },
        distinct: ["confirmationId"],
      })
    ).map((r) => r.confirmationId);

    await tx.workConfirmationLine.deleteMany({
      where: { allocationId: { in: ids } },
    });
    await tx.confirmationFocusLap.deleteMany({
      where: {
        OR: [{ allocationId: { in: ids } }, { allocationKey: { in: keys } }],
      },
    });
    await tx.confirmationFocusSession.deleteMany({
      where: {
        OR: [{ allocationId: { in: ids } }, { allocationKey: { in: keys } }],
      },
    });
    await tx.allocation.deleteMany({ where: { id: { in: ids } } });

    if (confirmationIds.length > 0) {
      const stillHaveLines = await tx.workConfirmationLine.findMany({
        where: { confirmationId: { in: confirmationIds } },
        select: { confirmationId: true },
        distinct: ["confirmationId"],
      });
      const keep = new Set(stillHaveLines.map((r) => r.confirmationId.toString()));
      const orphanConfirmationIds = confirmationIds.filter(
        (id) => !keep.has(id.toString())
      );
      if (orphanConfirmationIds.length > 0) {
        await tx.workConfirmation.deleteMany({
          where: { id: { in: orphanConfirmationIds } },
        });
      }
    }
  }
}
