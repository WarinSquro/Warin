// Employee bulk upload — Excel/CSV template + client-side parse & validation.
// Persistence happens row-by-row through the existing employee create/update
// APIs (see screens/EmployeeMaster.tsx UploadModal).
import * as XLSX from "xlsx";

export const EMPLOYEE_TEMPLATE_HEADERS = [
  "Name",
  "Employee ID (HRMS)",
  "Email",
  "Department",
  "Skills (semicolon-separated)",
] as const;

const REQUIRED_COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name"],
  hrmsId: ["employeeid(hrms)", "employeeidhrms", "hrmsid", "employeeid"],
  email: ["email"],
  department: ["department"],
};

const SKILLS_COLUMN_ALIASES = ["skillssemicolonseparated", "skills"];

export interface ParsedEmployeeRow {
  rowNum: number;
  hrmsId: string;
  name: string;
  email: string;
  department: string;
  skills: string[];
  errors: string[];
}

export interface ParsedEmployeeWorkbook {
  rows: ParsedEmployeeRow[];
  /** Set when the file itself couldn't be read/parsed, or required columns are missing. */
  fileError?: string;
}

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function isAcceptedUploadFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumnKey(headerKeys: string[], aliases: string[]): string | undefined {
  return headerKeys.find((k) => aliases.includes(normalizeHeader(k)));
}

export async function parseEmployeeWorkbook(
  file: File,
  activeDepartmentNames: string[]
): Promise<ParsedEmployeeWorkbook> {
  if (!isAcceptedUploadFile(file)) {
    return { rows: [], fileError: "Unsupported file type. Upload a .xlsx, .xls, or .csv file." };
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return { rows: [], fileError: "Could not read this file. Confirm it's a valid Excel/CSV export." };
  }

  const sheetName = workbook.SheetNames.find((n) => n.toLowerCase() !== "instructions") ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    return { rows: [], fileError: "The file has no readable sheet." };
  }

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (records.length === 0) {
    return { rows: [], fileError: "No data rows found in the file." };
  }

  const headerKeys = Object.keys(records[0]);
  const nameKey = findColumnKey(headerKeys, REQUIRED_COLUMN_ALIASES.name);
  const hrmsKey = findColumnKey(headerKeys, REQUIRED_COLUMN_ALIASES.hrmsId);
  const emailKey = findColumnKey(headerKeys, REQUIRED_COLUMN_ALIASES.email);
  const deptKey = findColumnKey(headerKeys, REQUIRED_COLUMN_ALIASES.department);
  const skillsKey = findColumnKey(headerKeys, SKILLS_COLUMN_ALIASES);

  const missing: string[] = [];
  if (!nameKey) missing.push("Name");
  if (!hrmsKey) missing.push("Employee ID (HRMS)");
  if (!emailKey) missing.push("Email");
  if (!deptKey) missing.push("Department");
  if (missing.length > 0) {
    return { rows: [], fileError: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  }

  const cell = (rec: Record<string, unknown>, key?: string) =>
    key ? String(rec[key] ?? "").trim() : "";

  const activeDeptLower = new Set(activeDepartmentNames.map((d) => d.toLowerCase()));

  const rows: ParsedEmployeeRow[] = records.map((rec, i) => {
    const hrmsId = cell(rec, hrmsKey);
    const name = cell(rec, nameKey);
    const email = cell(rec, emailKey);
    const department = cell(rec, deptKey);
    const skills = skillsKey
      ? cell(rec, skillsKey)
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const errors: string[] = [];
    if (!hrmsId) errors.push("Missing Employee ID (HRMS)");
    if (!name) errors.push("Missing Name");
    if (!email) errors.push("Missing Email");
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push("Invalid email format");
    if (!department) errors.push("Missing Department");
    else if (activeDeptLower.size > 0 && !activeDeptLower.has(department.toLowerCase())) {
      errors.push(`Unknown department "${department}"`);
    }

    return { rowNum: i + 2, hrmsId, name, email, department, skills, errors };
  });

  const idCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.hrmsId) continue;
    idCounts.set(r.hrmsId, (idCounts.get(r.hrmsId) ?? 0) + 1);
  }
  for (const r of rows) {
    if (r.hrmsId && (idCounts.get(r.hrmsId) ?? 0) > 1) {
      r.errors.push("Duplicate Employee ID within file");
    }
  }

  return { rows };
}

export function downloadEmployeeUploadTemplate(): void {
  const wb = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([
    [...EMPLOYEE_TEMPLATE_HEADERS],
    ["Ravi Sharma", "EMP-1234", "ravi.sharma@acme.io", "Engineering", "React;Node.js;AWS"],
  ]);
  dataSheet["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, dataSheet, "Employees");

  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ["Instructions"],
    ["1. Employee ID (HRMS) is the unique key — it must be unique within the file and is used to match existing employees for updates."],
    ["2. Name, Employee ID (HRMS), Email and Department are mandatory for every row."],
    ["3. Department must match an existing active department name exactly (see Setup → Departments)."],
    ["4. Skills is optional — separate multiple skills with a semicolon, e.g. React;Node.js;AWS."],
    ["5. Rows with errors (missing fields, unknown department, duplicate ID) are skipped — the rest still import."],
  ]);
  instructionsSheet["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instructionsSheet, "Instructions");

  XLSX.writeFile(wb, "OneView-Employee-Upload-Template.xlsx");
}
