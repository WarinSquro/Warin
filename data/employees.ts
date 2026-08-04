// Employee master — the only master with XLS bulk upload.
// Employee ID = HRMS ID (unique key). Single Name field, no Designation.
// Disable, never delete — deactivated rows preserve history.

export type EmpStatus = "active" | "inactive";

export interface Employee {
  id: string;        // HRMS ID — unique key
  name: string;
  email: string;
  department: string;
  skills: string[];
  resourceOwnerId?: string;
  status: EmpStatus;
  utilization?: number;
}

export const DEPARTMENTS = ["Engineering", "QA", "Design", "DevOps", "Support"];

export const EMPLOYEES: Employee[] = [
  { id: "EMP-0001", name: "Administrator", email: "admin@acme.io", department: "Engineering", skills: ["Administration"], status: "active" },
  { id: "EMP-1042", name: "Ravi Sharma", email: "ravi.sharma@acme.io", department: "Engineering", skills: ["React", "Node.js", "AWS"], resourceOwnerId: "EMP-1088", status: "active", utilization: 110 },
  { id: "EMP-1043", name: "Arjun Mehta", email: "arjun.mehta@acme.io", department: "Engineering", skills: ["React", "TypeScript"], resourceOwnerId: "EMP-1042", status: "active", utilization: 105 },
  { id: "EMP-1051", name: "Priya Nair", email: "priya.nair@acme.io", department: "QA", skills: ["Automation", "Selenium", "API testing"], resourceOwnerId: "EMP-0991", status: "active", utilization: 80 },
  { id: "EMP-1058", name: "Vikram Kaul", email: "vikram.kaul@acme.io", department: "Engineering", skills: ["Java", "Spring", "PostgreSQL"], resourceOwnerId: "EMP-1042", status: "active", utilization: 75 },
  { id: "EMP-1062", name: "Deepa Menon", email: "deepa.menon@acme.io", department: "Engineering", skills: ["Python", "Django"], resourceOwnerId: "EMP-1058", status: "active", utilization: 60 },
  { id: "EMP-1067", name: "Sneha Rao", email: "sneha.rao@acme.io", department: "Support", skills: ["Zendesk", "SQL"], resourceOwnerId: "EMP-1088", status: "active", utilization: 40 },
  { id: "EMP-1071", name: "Tara Gupta", email: "tara.gupta@acme.io", department: "QA", skills: ["Cypress", "Playwright"], resourceOwnerId: "EMP-1051", status: "active", utilization: 22 },
  { id: "EMP-1088", name: "Kiran Bose", email: "kiran.bose@acme.io", department: "DevOps", skills: ["Kubernetes", "Terraform"], resourceOwnerId: "EMP-1042", status: "active", utilization: 68 },
  { id: "EMP-0991", name: "Meera Pillai", email: "meera.pillai@acme.io", department: "Design", skills: ["Figma", "UX research"], resourceOwnerId: "EMP-1042", status: "active", utilization: 55 },
  { id: "EMP-0842", name: "Rahul Verma", email: "rahul.verma@acme.io", department: "Engineering", skills: ["Go", "gRPC"], resourceOwnerId: "EMP-1042", status: "inactive" },
  { id: "EMP-1102", name: "Dev Malhotra", email: "dev.malhotra@acme.io", department: "Engineering", skills: ["React"], resourceOwnerId: "EMP-1042", status: "active" },
  { id: "EMP-0765", name: "Anita Desai", email: "anita.desai@acme.io", department: "Design", skills: ["Illustration"], status: "inactive" },
];

export function resourceOwnerName(ownerId: string | undefined, employees = EMPLOYEES) {
  if (!ownerId) return "—";
  return employees.find((e) => e.id === ownerId)?.name ?? "—";
}

/**
 * Immediate (direct) reports of a Resource Owner — `resourceOwnerId === ownerHrmsId`.
 * Does not include the owner or deeper hierarchy levels.
 */
export function getImmediateReports(
  ownerHrmsId: string,
  employees: Employee[],
  opts?: { activeOnly?: boolean }
): Employee[] {
  const activeOnly = opts?.activeOnly !== false;
  return employees.filter(
    (e) =>
      e.resourceOwnerId === ownerHrmsId &&
      (!activeOnly || e.status === "active")
  );
}

/**
 * Planning screens: super-admin sees all active employees; Resource Owners see
 * only their immediate reports.
 */
export function scopePlanningEmployees(
  employees: Employee[],
  opts: { ownerHrmsId?: string | null; isSuperAdmin?: boolean }
): Employee[] {
  const active = employees.filter((e) => e.status === "active");
  if (opts.isSuperAdmin) return active;
  if (!opts.ownerHrmsId) return [];
  return getImmediateReports(opts.ownerHrmsId, active, { activeOnly: true });
}

// Simulated result of an XLS bulk upload preview.
export interface UploadRow {
  row: number;
  id: string;
  name: string;
  department: string;
  result: "new" | "update" | "error";
  message?: string;
}

export const UPLOAD_PREVIEW: UploadRow[] = [
  { row: 2, id: "EMP-1120", name: "Nikhil Jain", department: "Engineering", result: "new" },
  { row: 3, id: "EMP-1121", name: "Sana Sheikh", department: "QA", result: "new" },
  { row: 4, id: "EMP-1042", name: "Ravi Sharma", department: "Engineering", result: "update", message: "Existing record — skills will be updated" },
  { row: 5, id: "EMP-1122", name: "Karan Malhotra", department: "Design", result: "new" },
  { row: 6, id: "EMP-1043", name: "Arjun M.", department: "Engineering", result: "error", message: "Duplicate ID within file (row 8) — skipped" },
  { row: 7, id: "", name: "Pooja Iyer", department: "Support", result: "error", message: "Missing Employee ID — skipped" },
];
