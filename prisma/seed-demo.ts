/**
 * Full demo seed — Argon2 PIN hashes (demo PIN: 12345).
 * Run: `npm run db:seed:demo`
 * Blank (masters + 1 admin): `npm run db:seed` / `npm run db:reset:blank`
 */
import { PrismaClient, type ProjectType, type MilestoneKind } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();
const DEMO_PIN = "12345";

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function main() {
  console.log("Seeding Warin (BIGINT schema)…");

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

  const pinHash = await argon2.hash(DEMO_PIN, { type: argon2.argon2id });

  const depts = [
    { code: "dept-1", name: "Engineering", headName: "Ravi Sharma" },
    { code: "dept-2", name: "QA", headName: "Priya Nair" },
    { code: "dept-3", name: "Design", headName: "Meera Pillai" },
    { code: "dept-4", name: "DevOps", headName: "Kiran Bose" },
    { code: "dept-5", name: "Support", headName: "Sneha Rao" },
    { code: "dept-6", name: "Delivery", headName: "Vikram Kaul", status: "inactive" as const, isActive: false },
  ];
  const deptIds: Record<string, bigint> = {};
  for (const d of depts) {
    const row = await prisma.department.create({
      data: {
        code: d.code,
        name: d.name,
        headName: d.headName,
        status: d.status ?? "active",
        isActive: d.isActive ?? true,
      },
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
    { code: "sk-11", name: "Go / gRPC", category: "Backend", status: "inactive" as const, isActive: false },
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
        status: s.status ?? "active",
        isActive: s.isActive ?? true,
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
  const customerIds: Record<string, bigint> = {};
  for (const c of customers) {
    const row = await prisma.customer.create({ data: { code: c.code, name: c.name } });
    customerIds[c.name] = row.id;
  }

  const alias: Record<string, string> = {
    Administration: "Administration",
    React: "React",
    "Node.js": "Node.js",
    AWS: "AWS",
    TypeScript: "TypeScript",
    Automation: "Selenium / Playwright",
    Selenium: "Selenium / Playwright",
    "API testing": "Selenium / Playwright",
    Java: "Java / Spring",
    Spring: "Java / Spring",
    Python: "Python / Django",
    Django: "Python / Django",
    PostgreSQL: "PostgreSQL",
    Zendesk: "Zendesk",
    SQL: "PostgreSQL",
    Cypress: "Selenium / Playwright",
    Playwright: "Selenium / Playwright",
    Kubernetes: "Kubernetes / Terraform",
    Terraform: "Kubernetes / Terraform",
    Figma: "Figma / UX Research",
    "UX research": "Figma / UX Research",
    Go: "Go / gRPC",
    gRPC: "Go / gRPC",
    Illustration: "Figma / UX Research",
  };

  const employees = [
    { hrmsId: "EMP-0001", name: "Administrator", email: "admin@acme.io", department: "Engineering", skills: ["Administration"], isSuperAdmin: true },
    { hrmsId: "EMP-1042", name: "Ravi Sharma", email: "ravi.sharma@acme.io", department: "Engineering", skills: ["React", "Node.js", "AWS"], resourceOwnerHrms: "EMP-1088", utilization: 110 },
    { hrmsId: "EMP-1043", name: "Arjun Mehta", email: "arjun.mehta@acme.io", department: "Engineering", skills: ["React", "TypeScript"], resourceOwnerHrms: "EMP-1042", utilization: 105 },
    { hrmsId: "EMP-1051", name: "Priya Nair", email: "priya.nair@acme.io", department: "QA", skills: ["Automation", "Selenium", "API testing"], resourceOwnerHrms: "EMP-0991", utilization: 80 },
    { hrmsId: "EMP-1058", name: "Vikram Kaul", email: "vikram.kaul@acme.io", department: "Engineering", skills: ["Java", "Spring", "PostgreSQL"], resourceOwnerHrms: "EMP-1042", utilization: 75 },
    { hrmsId: "EMP-1062", name: "Deepa Menon", email: "deepa.menon@acme.io", department: "Engineering", skills: ["Python", "Django"], resourceOwnerHrms: "EMP-1058", utilization: 60 },
    { hrmsId: "EMP-1067", name: "Sneha Rao", email: "sneha.rao@acme.io", department: "Support", skills: ["Zendesk", "SQL"], resourceOwnerHrms: "EMP-1088", utilization: 40 },
    { hrmsId: "EMP-1071", name: "Tara Gupta", email: "tara.gupta@acme.io", department: "QA", skills: ["Cypress", "Playwright"], resourceOwnerHrms: "EMP-1051", utilization: 22 },
    { hrmsId: "EMP-1088", name: "Kiran Bose", email: "kiran.bose@acme.io", department: "DevOps", skills: ["Kubernetes", "Terraform"], resourceOwnerHrms: "EMP-1042", utilization: 68 },
    { hrmsId: "EMP-0991", name: "Meera Pillai", email: "meera.pillai@acme.io", department: "Design", skills: ["Figma", "UX research"], resourceOwnerHrms: "EMP-1042", utilization: 55 },
    { hrmsId: "EMP-0842", name: "Rahul Verma", email: "rahul.verma@acme.io", department: "Engineering", skills: ["Go", "gRPC"], resourceOwnerHrms: "EMP-1042", status: "inactive" as const, isActive: false },
    { hrmsId: "EMP-1102", name: "Dev Malhotra", email: "dev.malhotra@acme.io", department: "Engineering", skills: ["React"], resourceOwnerHrms: "EMP-1042" },
    { hrmsId: "EMP-0765", name: "Anita Desai", email: "anita.desai@acme.io", department: "Design", skills: ["Illustration"], status: "inactive" as const, isActive: false },
  ];

  const empByHrms: Record<string, bigint> = {};
  for (const e of employees) {
    const row = await prisma.employee.create({
      data: {
        hrmsId: e.hrmsId,
        name: e.name,
        email: e.email.toLowerCase(),
        pinHash,
        departmentId: deptIds[e.department],
        status: e.status ?? "active",
        isActive: e.isActive ?? true,
        isSuperAdmin: e.isSuperAdmin ?? false,
        utilization: e.utilization ?? null,
      },
    });
    empByHrms[e.hrmsId] = row.id;
  }

  for (const e of employees) {
    if (!e.resourceOwnerHrms) continue;
    await prisma.employee.update({
      where: { id: empByHrms[e.hrmsId] },
      data: { resourceOwnerId: empByHrms[e.resourceOwnerHrms] },
    });
  }

  const rights: Record<string, string[]> = {
    "EMP-1042": [
      "my_workspace", "planner", "availability", "utilization", "confirmations", "planning_conflicts",
      "reports.deployment", "reports.performance", "reports.execution", "reports.daily_work", "my_team.weekly_check_in",
    ],
    "EMP-1043": ["my_workspace", "planner", "confirmations", "reports.performance", "reports.daily_work"],
    "EMP-1051": ["my_workspace", "confirmations", "reports.execution", "reports.daily_work", "my_team.weekly_check_in"],
    "EMP-1088": ["my_workspace", "utilization", "confirmations", "my_team.weekly_check_in"],
  };

  for (const e of employees) {
    const ids = new Set<bigint>();
    for (const label of e.skills) {
      const name = alias[label] ?? label;
      if (skillIds[name]) ids.add(skillIds[name]);
    }
    if (ids.size) {
      await prisma.employeeSkill.createMany({
        data: [...ids].map((skillId) => ({ employeeId: empByHrms[e.hrmsId], skillId })),
      });
    }
    const keys = rights[e.hrmsId] ?? [];
    if (keys.length) {
      await prisma.employeePermission.createMany({
        data: keys.map((key) => ({ employeeId: empByHrms[e.hrmsId], key })),
      });
    }
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
    { code: "act-11", name: "Sprint Planning", milestone: "am-5", billable: false, status: "inactive" as const, isActive: false },
  ];
  for (const a of activities) {
    await prisma.activity.create({
      data: {
        code: a.code,
        name: a.name,
        activityMilestoneId: amIds[a.milestone],
        billable: a.billable,
        status: a.status ?? "active",
        isActive: a.isActive ?? true,
      },
    });
  }

  const falcon = await prisma.project.create({
    data: {
      projectCode: "PRJ-014",
      name: "Project Falcon",
      customerId: customerIds["Northwind Inc."],
      poNumber: "PO-2024-0091",
      type: "paid",
      kickoffDate: parseDate("2024-11-15"),
      startDate: parseDate("2024-12-01"),
      endDate: parseDate("2025-03-31"),
      demand: "2× Node.js, Java / Spring · 1× Selenium / Playwright",
      milestones: {
        create: [
          { name: "M1 · Discovery & Design", date: parseDate("2024-12-20") },
          { name: "M2 · Core Build", date: parseDate("2025-02-14") },
          { name: "M3 · UAT & Go-live", date: parseDate("2025-03-28") },
        ],
      },
      demandLines: {
        create: [
          { skills: ["Node.js", "Java / Spring"], count: 2 },
          { skills: ["Selenium / Playwright"], count: 1 },
        ],
      },
    },
  });
  void falcon;

  await prisma.project.create({
    data: {
      projectCode: "PRJ-015",
      name: "Project Atlas",
      customerId: customerIds["Contoso Ltd."],
      poNumber: "PO-2024-0104",
      type: "paid",
      kickoffDate: parseDate("2024-12-01"),
      startDate: parseDate("2025-01-06"),
      endDate: parseDate("2025-04-30"),
      demand: "1 Developer, 1 QA",
      milestones: {
        create: [
          { name: "M1 · Setup & Onboarding", date: parseDate("2025-01-31") },
          { name: "M2 · QA Phase", date: parseDate("2025-03-15") },
        ],
      },
    },
  });

  await prisma.project.create({
    data: {
      projectCode: "PRJ-017",
      name: "Project Nova",
      customerId: customerIds["Globex Corp."],
      type: "poc",
      approvedByName: "Sarah Chen",
      approvedByDate: parseDate("2025-01-08"),
      kickoffDate: parseDate("2025-01-10"),
      startDate: parseDate("2025-01-15"),
      endDate: parseDate("2025-05-31"),
      demand: "1 Developer, 1 Designer",
      milestones: { create: [{ name: "M1 · Internal Alpha", date: parseDate("2025-03-01") }] },
    },
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

  await prisma.companyOffDay.createMany({
    data: [
      { date: parseDate("2026-01-01"), label: "New Year's Day" },
      { date: parseDate("2026-01-26"), label: "Republic Day" },
    ],
  });

  console.log(`Demo seed complete. Demo PIN for all users: ${DEMO_PIN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
