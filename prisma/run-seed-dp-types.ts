/**
 * One-shot upsert of the 7 Decision Point types (safe for existing DBs).
 * Run: npx tsx prisma/run-seed-dp-types.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedDecisionPointTypes } from "./seed-decision-point-types";

const prisma = new PrismaClient();

async function main() {
  const n = await seedDecisionPointTypes(prisma);
  console.log(`seeded ${n} decision point types`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
