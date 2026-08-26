/**
 * Sync decision_point_types into docs/OneView_Table_Structure.xlsx (table 32)
 * + enum DecisionPointAllocationRequirement
 *
 * Run: node scripts/apply-decision-point-types-doc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const root = path.resolve(import.meta.dirname, "..");
const canonical = path.join(root, "docs", "OneView_Table_Structure.xlsx");
const fallback = path.join(root, "docs", "OneView_Table_Structure_UPDATED.xlsx");

function loadBook() {
  const file = fs.existsSync(canonical) ? canonical : fallback;
  return { book: XLSX.readFile(file), file };
}

function sheetToRows(book, name) {
  const sh = book.Sheets[name];
  if (!sh) return [];
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
}

function writeSheet(book, name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  book.Sheets[name] = ws;
  if (!book.SheetNames.includes(name)) book.SheetNames.push(name);
}

function istStamp() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
}

const auditCols = [
  ["is_active", "BOOLEAN", "—", "true", "Soft-active flag", "Required"],
  ["is_deleted", "BOOLEAN", "—", "false", "Soft-delete flag", "Required"],
  ["deleted_at", "TIMESTAMP", "—", "NULL", "Soft-delete time", "Nullable"],
  ["created_at", "TIMESTAMP", "—", "now()", "Created", "Required"],
  ["modified_at", "TIMESTAMP", "—", "updatedAt", "Last modified", "Required"],
  ["created_by", "BIGINT", "—", "NULL", "Actor employee id", "Nullable"],
  ["modified_by", "BIGINT", "—", "NULL", "Actor employee id", "Nullable"],
  ["version", "INTEGER", "—", "1", "Optimistic version", "Required"],
];

const TABLE = {
  no: 32,
  name: "decision_point_types",
  purpose: "Decision Point type master (Setup → Org · Skills · Activities → DP Types)",
  fields: [
    ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
    ["code", "TEXT", "—", "—", "Business code (unique)", "Required; Unique"],
    ["name", "TEXT", "—", "—", "Display name (unique)", "Required; Unique"],
    ["description", "TEXT", "—", "NULL", "Helper text on Raise", "Optional"],
    [
      "allocation_requirement",
      "ENUM",
      "DecisionPointAllocationRequirement",
      "optional",
      "optional | required — whether Raise must link work allocation",
      "Required",
    ],
    ["status", "ENUM", "SetupStatus", "active", "active | inactive", "Required"],
    ...auditCols,
  ],
};

const ENUM_ROW = [
  "DecisionPointAllocationRequirement",
  "optional | required",
  "decision_point_types.allocation_requirement",
  "Whether Raise Point must link a work allocation for this type",
];

function upsertIndex(rows) {
  const header = rows[0] ?? ["No", "Table", "Purpose", "Updated"];
  const body = rows.slice(1).filter((r) => String(r[1] ?? "") !== TABLE.name);
  body.push([TABLE.no, TABLE.name, TABLE.purpose, istStamp()]);
  body.sort((a, b) => Number(a[0]) - Number(b[0]));
  return [header, ...body];
}

function upsertFields(rows) {
  const header =
    rows[0] ??
    ["Table No", "Table", "Field No", "Field", "Data Type", "Size/Enum", "Default", "Remarks", "Rule"];
  const body = rows.slice(1).filter((r) => String(r[1] ?? "") !== TABLE.name);
  TABLE.fields.forEach((f, i) => {
    body.push([TABLE.no, TABLE.name, i + 1, ...f]);
  });
  body.sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[2]) - Number(b[2]));
  return [header, ...body];
}

function upsertEnums(rows) {
  const header = rows[0] ?? ["Enum", "Values", "Used By", "Notes"];
  const body = rows.slice(1).filter((r) => String(r[0] ?? "") !== ENUM_ROW[0]);
  body.push(ENUM_ROW);
  body.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [header, ...body];
}

const { book, file } = loadBook();
writeSheet(book, "00_Index", upsertIndex(sheetToRows(book, "00_Index")));
writeSheet(book, "01_Table_Fields", upsertFields(sheetToRows(book, "01_Table_Fields")));
writeSheet(book, "02_Enums", upsertEnums(sheetToRows(book, "02_Enums")));

let out = file;
try {
  XLSX.writeFile(book, canonical);
  out = canonical;
} catch {
  XLSX.writeFile(book, fallback);
  out = fallback;
}
console.log(`Updated ${out} with ${TABLE.name} (T${TABLE.no})`);
