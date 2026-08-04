/**
 * Blank seed — required masters + one login user. No demo employees/projects.
 * Demo PIN: 12345
 *
 * Full demo data: `npm run db:seed:demo` (prisma/seed-demo.ts)
 */
import { PrismaClient, type ProjectType, type MilestoneKind } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();
const DEMO_PIN = "12345";

async function wipe() {
  await prisma.refreshToken.deleteMany();
  await prisma.pinResetToken.deleteMany();
  await prisma.employeePermission.deleteMany();
  await prisma.employeeSkill.deleteMany();
  await prisma.projectDemandLine.deleteMany();
  await prisma.projectMilestone.deleteMany();
  await prisma.project.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.activityMilestone.deleteMany();
  await prisma.companyOffDay.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.department.deleteMany();
}

async function main() {
  console.log("Seeding Warin (blank: masters + 1 admin)…");
  await wipe();

  const pinHash = await argon2.hash(DEMO_PIN, { type: argon2.argon2id });

  const depts = [
    { code: "dept-1", name: "Engineering", headName: "—" },
    { code: "dept-2", name: "QA", headName: "—" },
    { code: "dept-3", name: "Design", headName: "—" },
    { code: "dept-4", name: "DevOps", headName: "—" },
    { code: "dept-5", name: "Support", headName: "—" },
  ];
  const deptIds: Record<string, bigint> = {};
  for (const d of depts) {
    const row = await prisma.department.create({
      data: { code: d.code, name: d.name, headName: d.headName },
    });
    deptIds[d.name] = row.id;
  }

  const skillCategoryNames = [
    "Frontend",
    "Backend",
    "QA",
    "Design",
    "DevOps",
    "Other",
    "General",
    "Support",
  ];
  const skillCategoryIds: Record<string, bigint> = {};
  for (const [i, name] of skillCategoryNames.entries()) {
    const row = await prisma.skillCategory.create({
      data: { code: `scat-${i + 1}`, name },
    });
    skillCategoryIds[name] = row.id;
  }

  const skills = [
    { code: "sk-1", name: "React", category: "Frontend" },
    { code: "sk-2", name: "TypeScript", category: "Frontend" },
    { code: "sk-3", name: "Node.js", category: "Backend" },
    { code: "sk-4", name: "Java / Spring", category: "Backend" },
    { code: "sk-5", name: "Python / Django", category: "Backend" },
    { code: "sk-6", name: "Selenium / Playwright", category: "QA" },
    { code: "sk-7", name: "Figma / UX Research", category: "Design" },
    { code: "sk-8", name: "Kubernetes / Terraform", category: "DevOps" },
    { code: "sk-9", name: "PostgreSQL", category: "Backend" },
    { code: "sk-10", name: "AWS", category: "DevOps" },
    { code: "sk-12", name: "Administration", category: "General" },
    { code: "sk-13", name: "Zendesk", category: "Support" },
  ];
  const skillIds: Record<string, bigint> = {};
  for (const s of skills) {
    const row = await prisma.skill.create({
      data: {
        code: s.code,
        name: s.name,
        categoryId: skillCategoryIds[s.category] ?? skillCategoryIds.Other,
      },
    });
    skillIds[s.name] = row.id;
  }

  const customers = [
    { code: "cust-1", name: "Northwind Inc." },
    { code: "cust-2", name: "Contoso Ltd." },
    { code: "cust-3", name: "Globex Corp." },
    { code: "cust-4", name: "Initech" },
    { code: "cust-5", name: "Umbrella Co." },
    { code: "cust-6", name: "In-house" },
    { code: "cust-7", name: "Amul" },
  ];
  for (const c of customers) {
    await prisma.customer.create({ data: { code: c.code, name: c.name } });
  }

  const milestones: { code: string; name: string; projectType: ProjectType; kind: MilestoneKind }[] = [
    { code: "am-1", name: "M1 · Discovery & Design", projectType: "paid", kind: "commercial_signoff" },
    { code: "am-2", name: "M2 · Core Build", projectType: "paid", kind: "commercial_only" },
    { code: "am-3", name: "M1 · POC Validation", projectType: "poc", kind: "checkpoint_only" },
    { code: "am-4", name: "M1 · Internal Alpha", projectType: "product", kind: "checkpoint_only" },
    { code: "am-5", name: "General / Ongoing", projectType: "product", kind: "checkpoint_only" },
  ];
  const amIds: Record<string, bigint> = {};
  for (const m of milestones) {
    const row = await prisma.activityMilestone.create({ data: m });
    amIds[m.code] = row.id;
  }

  const activities = [
    { code: "act-1", name: "Feature Development", milestone: "am-2", billable: true },
    { code: "act-2", name: "Bug Fixing", milestone: "am-2", billable: true },
    { code: "act-3", name: "Code Review", milestone: "am-2", billable: true },
    { code: "act-4", name: "Testing / QA", milestone: "am-1", billable: true },
    { code: "act-5", name: "Design & Prototyping", milestone: "am-1", billable: true },
    { code: "act-6", name: "Support Queue", milestone: "am-2", billable: true },
    { code: "act-7", name: "Team Sync / Standup", milestone: "am-5", billable: false },
    { code: "act-8", name: "Internal Meeting", milestone: "am-5", billable: false },
    { code: "act-9", name: "Training / L&D", milestone: "am-4", billable: false },
    { code: "act-10", name: "Documentation", milestone: "am-3", billable: false },
  ];
  for (const a of activities) {
    await prisma.activity.create({
      data: {
        code: a.code,
        name: a.name,
        activityMilestoneId: amIds[a.milestone],
        billable: a.billable,
      },
    });
  }

  const admin = await prisma.employee.create({
    data: {
      hrmsId: "EMP-0001",
      name: "Administrator",
      email: "admin@acme.io",
      pinHash,
      departmentId: deptIds.Engineering,
      isSuperAdmin: true,
      status: "active",
      isActive: true,
    },
  });

  await prisma.employeeSkill.create({
    data: { employeeId: admin.id, skillId: skillIds.Administration },
  });

  await prisma.appSettings.create({
    data: {
      code: "default",
      idleBelow: 70,
      optimalTo: 100,
      excellent: 95,
      good: 90,
      needsAttention: 80,
      capacityBasis: "billable",
      overallocationLimit: 120,
      workingHoursPerDay: 8.5,
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      demandPriority: ["Critical", "High", "Medium", "Low"],
    },
  });

  console.log(`Blank seed complete.`);
  console.log(`  Login: admin@acme.io / PIN ${DEMO_PIN}`);
  console.log(`  Masters: ${depts.length} departments, ${skills.length} skills, ${activities.length} activities`);
  console.log(`  Employees: 1 (admin) · Projects: 0`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
