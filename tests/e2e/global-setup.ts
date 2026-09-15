import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import {
  API_BASES,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_HRMS_ID,
  E2E_ADMIN_PIN,
  E2E_RESTRICTED_EMAIL,
  E2E_RESTRICTED_HRMS_ID,
  E2E_RESTRICTED_PIN,
} from "./auth-fixture";

async function apiIsRunning(): Promise<boolean> {
  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return true;
    } catch {
      // Try the next supported local API address.
    }
  }
  return false;
}

export default async function globalSetup(): Promise<void> {
  if (!(await apiIsRunning())) return;

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.employee.findMany({
      where: {
        OR: [
          { email: E2E_ADMIN_EMAIL },
          { hrmsId: E2E_ADMIN_HRMS_ID },
          { email: E2E_RESTRICTED_EMAIL },
          { hrmsId: E2E_RESTRICTED_HRMS_ID },
        ],
      },
      select: { id: true },
    });
    const existingIds = existing.map((employee) => employee.id);
    const [adminPinHash, restrictedPinHash] = await Promise.all([
      argon2.hash(E2E_ADMIN_PIN, { type: argon2.argon2id }),
      argon2.hash(E2E_RESTRICTED_PIN, { type: argon2.argon2id }),
    ]);

    await prisma.$transaction(async (tx) => {
      if (existingIds.length > 0) {
        await tx.refreshToken.deleteMany({ where: { employeeId: { in: existingIds } } });
        await tx.employee.deleteMany({ where: { id: { in: existingIds } } });
      }
      await tx.employee.create({
        data: {
          hrmsId: E2E_ADMIN_HRMS_ID,
          name: "E2E Controlled Administrator",
          email: E2E_ADMIN_EMAIL,
          pinHash: adminPinHash,
          isSuperAdmin: true,
          mustChangePin: false,
          status: "active",
          isActive: true,
          isDeleted: false,
        },
      });
      await tx.employee.create({
        data: {
          hrmsId: E2E_RESTRICTED_HRMS_ID,
          name: "E2E Controlled Restricted User",
          email: E2E_RESTRICTED_EMAIL,
          pinHash: restrictedPinHash,
          isSuperAdmin: false,
          mustChangePin: false,
          status: "active",
          isActive: true,
          isDeleted: false,
        },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}
