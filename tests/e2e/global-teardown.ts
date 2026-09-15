import { PrismaClient } from "@prisma/client";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_HRMS_ID,
  E2E_RESTRICTED_EMAIL,
  E2E_RESTRICTED_HRMS_ID,
} from "./auth-fixture";

export default async function globalTeardown(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const prisma = new PrismaClient();
  try {
    const employees = await prisma.employee.findMany({
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
    const employeeIds = employees.map((employee) => employee.id);
    if (employeeIds.length === 0) return;

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await tx.employee.deleteMany({ where: { id: { in: employeeIds } } });
    });
  } catch {
    // Public-only E2E runs may intentionally have no database available.
  } finally {
    await prisma.$disconnect();
  }
}
