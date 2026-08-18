import * as XLSX from "xlsx";
import type { MilestoneKind, ProjectType } from "../data/projects";
import { MILESTONE_KIND_OPTIONS } from "../data/projects";

export const ACTIVITY_TEMPLATE_HEADERS = [
  "Milestone",
  "Milestone Type",
  "Activity Type",
  "Activity Name",
  "Type",
] as const;

export type ParsedActivityRow = {
  rowNum: number;
  milestoneName: string;
  kind: MilestoneKind | null;
  projectType: ProjectType;
  billable: boolean;
  activityName: string;
  errors: string[];
};

export type ParsedActivityWorkbook = {
  rows: ParsedActivityRow[];
  fileError?: string;
};

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function isAcceptedActivityUploadFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cell(rec: Record<string, unknown>, key: string | undefined): string {
  if (!key) return "";
  const v = rec[key];
  if (v == null) return "";
  return String(v).trim();
}

function findColumnKey(headerKeys: string[], aliases: string[]): string | undefined {
  return headerKeys.find((k) => aliases.includes(normalizeHeader(k)));
}

export function parseMilestoneKind(raw: string): MilestoneKind | null {
  const n = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!n) return null;
  const compact = n.replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, MilestoneKind> = {
    commercialonly: "commercial_only",
    commercial: "commercial_only",
    signoffonly: "signoff_only",
    signoff: "signoff_only",
    commercialsignoff: "commercial_signoff",
    commercialandsignoff: "commercial_signoff",
    signoffcommercial: "commercial_signoff",
    signoffandcommercial: "commercial_signoff",
    checkpointonly: "checkpoint_only",
    checkpoint: "checkpoint_only",
  };
  if (aliases[compact]) return aliases[compact];
  for (const o of MILESTONE_KIND_OPTIONS) {
    if (normalizeHeader(o.label) === compact || o.value === n.replace(/ /g, "_")) return o.value;
  }
  return null;
}

export function parseProjectType(raw: string): ProjectType | null {
  const n = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n === "paid" || n === "commercial") return "paid";
  if (n === "poc") return "poc";
  if (n === "product") return "product";
  if (n === "support") return "support";
  return null;
}

export function parseBillableFlag(raw: string): boolean | null {
  const n = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n) return null;
  if (["billable", "yes", "true", "y", "1"].includes(n)) return true;
  if (
    ["internal", "nonbillable", "no", "false", "n", "0", "internalnonbillable"].includes(n) ||
    n.startsWith("internal")
  ) {
    return false;
  }
  return null;
}

/**
 * Activity Type = project type (Paid / POC / Product).
 * Type column = Billable / Internal (non-billable). Activity Type may still
 * carry Billable/Internal for older templates; Type column wins when present.
 */
export function interpretActivityType(
  activityTypeRaw: string,
  billableTypeRaw: string,
  projectTypeRaw = ""
): { projectType: ProjectType; billable: boolean; error?: string } {
  let projectType = parseProjectType(projectTypeRaw);
  let billable = parseBillableFlag(billableTypeRaw);
  const asProject = parseProjectType(activityTypeRaw);
  const legacyBillable = parseBillableFlag(activityTypeRaw);

  if (asProject) {
    projectType = projectType ?? asProject;
  } else if (legacyBillable != null && !billableTypeRaw.trim()) {
    billable = billable ?? legacyBillable;
  } else if (activityTypeRaw.trim()) {
    return {
      projectType: "paid",
      billable: true,
      error: `Activity Type "${activityTypeRaw}" must be Paid, POC, Product, or Support`,
    };
  }

  if (billableTypeRaw.trim() && billable === null) {
    return {
      projectType: projectType ?? "paid",
      billable: true,
      error: `Type "${billableTypeRaw}" must be Billable or Internal (Non-billable)`,
    };
  }

  return {
    projectType: projectType ?? "paid",
    billable: billable ?? true,
  };
}

export async function parseActivityWorkbook(file: File): Promise<ParsedActivityWorkbook> {
  if (!isAcceptedActivityUploadFile(file)) {
    return { rows: [], fileError: "Unsupported file type. Upload a .xlsx, .xls, or .csv file." };
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return { rows: [], fileError: "Could not read this file. Confirm it's a valid Excel/CSV export." };
  }

  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() !== "instructions") ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { rows: [], fileError: "The file has no readable sheet." };

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (records.length === 0) return { rows: [], fileError: "No data rows found in the file." };

  const headerKeys = Object.keys(records[0] ?? {});
  const milestoneKey = findColumnKey(headerKeys, ["milestone", "milestonename"]);
  const kindKey = findColumnKey(headerKeys, ["milestonetype", "kind"]);
  const activityTypeKey = findColumnKey(headerKeys, ["activitytype"]);
  const activityNameKey = findColumnKey(headerKeys, ["activityname", "activity", "name"]);
  const projectTypeKey = findColumnKey(headerKeys, ["projecttype"]);
  const billableKey = findColumnKey(headerKeys, ["type", "billable", "billabletype"]);

  if (!milestoneKey || !kindKey || !activityTypeKey || !activityNameKey || !billableKey) {
    return {
      rows: [],
      fileError:
        "Missing required columns. Need Milestone, Milestone Type, Activity Type, Activity Name, and Type.",
    };
  }

  const rows: ParsedActivityRow[] = records.map((rec, i) => {
    const milestoneName = cell(rec, milestoneKey);
    const kindRaw = cell(rec, kindKey);
    const activityTypeRaw = cell(rec, activityTypeKey);
    const activityName = cell(rec, activityNameKey);
    const kind = parseMilestoneKind(kindRaw);
    const interpreted = interpretActivityType(
      activityTypeRaw,
      cell(rec, billableKey),
      cell(rec, projectTypeKey)
    );
    const errors: string[] = [];
    if (!milestoneName) errors.push("Missing Milestone");
    if (!kindRaw) errors.push("Missing Milestone Type");
    else if (!kind) errors.push(`Unknown Milestone Type "${kindRaw}"`);
    if (!activityTypeRaw) errors.push("Missing Activity Type");
    if (interpreted.error) errors.push(interpreted.error);
    if (!activityName) errors.push("Missing Activity Name");
    const typeRaw = cell(rec, billableKey);
    if (!typeRaw) errors.push("Missing Type (Billable or Internal)");
    return {
      rowNum: i + 2,
      milestoneName,
      kind,
      projectType: interpreted.projectType,
      billable: interpreted.billable,
      activityName,
      errors,
    };
  });

  return { rows };
}

export function downloadActivityUploadTemplate(): void {
  const wb = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([
    [...ACTIVITY_TEMPLATE_HEADERS],
    ["M1. Initiation", "Sign-off", "Paid", "Kick-off", "Billable"],
    ["M2. Governance", "Checkpoint", "Paid", "Project Management", "Internal (Non-billable)"],
  ]);
  dataSheet["!cols"] = [{ wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, dataSheet, "Activities");

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Instructions"],
    [
      "1. Required columns: Milestone, Milestone Type, Activity Type, Activity Name, Type.",
    ],
    [
      "2. Milestone Type: Sign-off, Checkpoint, Sign-off & Commercial, or Commercial.",
    ],
    ["3. Activity Type: Paid, POC, Product, or Support (project type for the milestone)."],
    ["4. Type: Billable or Internal (Non-billable) — controls the activity billable flag."],
    ["5. The same Milestone + Activity Type can be reused on several activity rows."],
    ["6. Rows with errors are skipped; valid rows still import."],
  ]);
  instructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");
  XLSX.writeFile(wb, "Warin-Activity-Upload-Template.xlsx");
}
