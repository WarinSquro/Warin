import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { descendantEmployeeIds } from "../auth/resource-owner-tree";

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

/** View scope: self + direct + indirect reportees (recursive). Super-admin: all active non-admin. */
export async function viewableEmployeeIds(
  prisma: PrismaService,
  user: JwtPayload
): Promise<bigint[] | "all"> {
  const selfPk = actorPk(user);
  if (!selfPk) return [];

  if (user.isSuperAdmin) return "all";

  const rows = await prisma.employee.findMany({
    where: { isDeleted: false },
    select: { id: true, resourceOwnerId: true },
  });
  const subs = descendantEmployeeIds(
    selfPk.toString(),
    rows.map((r) => ({
      id: r.id.toString(),
      resourceOwnerId: r.resourceOwnerId?.toString() ?? null,
    }))
  );
  const ids = new Set<bigint>([selfPk]);
  for (const id of subs) {
    if (/^\d+$/.test(id)) ids.add(BigInt(id));
  }
  return [...ids];
}

/** Mutate scope: direct + indirect reportees only (never self). Super-admin: all except self + Administrator. */
export async function mutableEmployeeIds(
  prisma: PrismaService,
  user: JwtPayload
): Promise<bigint[]> {
  const selfPk = actorPk(user);
  if (!selfPk) return [];

  if (user.isSuperAdmin) {
    const rows = await prisma.employee.findMany({
      where: { isDeleted: false, isActive: true, status: "active" },
      select: { id: true, hrmsId: true, name: true, isSuperAdmin: true },
    });
    return rows
      .filter((e) => e.id !== selfPk && !isAdministratorEmployee(e))
      .map((e) => e.id);
  }

  const rows = await prisma.employee.findMany({
    where: { isDeleted: false },
    select: { id: true, resourceOwnerId: true },
  });
  const subs = descendantEmployeeIds(
    selfPk.toString(),
    rows.map((r) => ({
      id: r.id.toString(),
      resourceOwnerId: r.resourceOwnerId?.toString() ?? null,
    }))
  );
  return subs.filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
}

export async function assertCanViewLeaveEmployee(
  prisma: PrismaService,
  user: JwtPayload,
  employeeId: bigint
): Promise<void> {
  const scope = await viewableEmployeeIds(prisma, user);
  if (scope === "all") return;
  if (!scope.some((id) => id === employeeId)) {
    throw new ForbiddenException("Employee is outside your leave view scope");
  }
}

export async function assertCanMutateLeaveEmployee(
  prisma: PrismaService,
  user: JwtPayload,
  employeeId: bigint
): Promise<void> {
  const selfPk = actorPk(user);
  if (selfPk && employeeId === selfPk) {
    throw new ForbiddenException("You cannot enter or change leave for yourself");
  }
  const scope = await mutableEmployeeIds(prisma, user);
  if (!scope.some((id) => id === employeeId)) {
    throw new ForbiddenException("Employee is outside your leave management scope");
  }
}

export function todayIsoInAppTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_DISPLAY_TIMEZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseLeaveDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10))) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function isoDate(d: Date): string {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Throws when any active leave exists for employee within [startDate, endDate] inclusive. */
export async function assertNoActiveLeaveInRange(
  prisma: PrismaService,
  employeeId: bigint,
  startDate: Date,
  endDate: Date
): Promise<void> {
  const hit = await prisma.resourceLeave.findFirst({
    where: {
      employeeId,
      status: "active",
      isDeleted: false,
      leaveDate: { gte: startDate, lte: endDate },
    },
  });
  if (hit) {
    throw new BadRequestException(
      "This resource is on leave for one or more dates in the selected range. Cancel the leave to allocate work."
    );
  }
}
