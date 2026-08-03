import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";

/**
 * Resource Owners may only act on immediate reports (`resource_owner_id` = self).
 * Super-admins are unrestricted.
 */
export async function assertCanPlanForEmployee(
  prisma: PrismaService,
  user: JwtPayload,
  target: { id: bigint; resourceOwnerId: bigint | null; hrmsId?: string }
): Promise<void> {
  if (user.isSuperAdmin) return;

  const manager = await prisma.employee.findFirst({
    where: { hrmsId: user.hrmsId, isDeleted: false },
    select: { id: true },
  });
  if (!manager) throw new ForbiddenException("Not authorized");

  if (target.resourceOwnerId == null || target.resourceOwnerId !== manager.id) {
    throw new ForbiddenException(
      "You can only plan and manage your immediate resources"
    );
  }
}

export async function immediateReportEmployeeIds(
  prisma: PrismaService,
  user: JwtPayload
): Promise<bigint[] | null> {
  /** `null` = unrestricted (super-admin). */
  if (user.isSuperAdmin) return null;

  const manager = await prisma.employee.findFirst({
    where: { hrmsId: user.hrmsId, isDeleted: false },
    select: { id: true },
  });
  if (!manager) return [];

  const reports = await prisma.employee.findMany({
    where: {
      isDeleted: false,
      status: "active",
      resourceOwnerId: manager.id,
    },
    select: { id: true },
  });
  return reports.map((e) => e.id);
}
