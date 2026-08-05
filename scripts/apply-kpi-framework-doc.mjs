/**
 * Sync KPI Framework tables into docs/OneView_Table_Structure.xlsx
 * Tables 28–31 + enums AssessmentCycle, KpiTargetDirection, KpiRowStatus
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

function masterFields(extra = []) {
  return [
    ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
    ["code", "TEXT", "—", "—", "Business code (unique)", "Required; Unique"],
    ["name", "TEXT", "—", "—", "Display name (unique)", "Required; Unique"],
    ["status", "ENUM", "SetupStatus", "active", "active | inactive", "Required"],
    ...extra,
    ...auditCols,
  ];
}

const TABLES = [
  {
    no: 28,
    name: "kpi_categories",
    purpose: "KPI Category master (Framework Masters tab)",
    fields: masterFields(),
  },
  {
    no: 29,
    name: "kpi_measurement_methods",
    purpose: "KPI Measurement Method master",
    fields: masterFields(),
  },
  {
    no: 30,
    name: "kpi_units_of_measurement",
    purpose: "KPI Unit of Measurement master",
    fields: masterFields(),
  },
  {
    no: 31,
    name: "kpi_framework_items",
    purpose: "Per-resource KPI definitions + results for an assessment cycle",
    fields: [
      ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required"],
      ["employee_id", "BIGINT", "—", "—", "FK → employees.id (resource)", "Required; FK PK"],
      ["calendar_year", "INTEGER", "—", "—", "Assessment calendar year", "Required"],
      ["assessment_cycle", "ENUM", "AssessmentCycle", "—", "Q1|Q2|Q3|Q4", "Required"],
      ["category_id", "BIGINT", "—", "—", "FK → kpi_categories.id", "Required; FK PK"],
      ["kpi_name", "TEXT", "—", "—", "Free-text KPI name", "Required"],
      ["measurement_method_id", "BIGINT", "—", "—", "FK → kpi_measurement_methods.id", "Required; FK PK"],
      ["unit_id", "BIGINT", "—", "—", "FK → kpi_units_of_measurement.id", "Required; FK PK"],
      ["target", "DECIMAL", "12,4", "—", "Target value", "Required"],
      ["target_direction", "ENUM", "KpiTargetDirection", "—", "higher_is_better | lower_is_better", "Required"],
      ["period_start_month", "INTEGER", "—", "—", "1–12 within cycle quarter", "Required"],
      ["period_end_month", "INTEGER", "—", "—", "1–12 within cycle quarter; ≥ start", "Required"],
      ["weightage", "DECIMAL", "6,2", "—", "Weight %; resource cycle sum should be 100", "Required; ≥ 0"],
      ["status", "ENUM", "KpiRowStatus", "draft", "draft → pending_result → completed", "Required"],
      ["kpi_result", "DECIMAL", "12,4", "NULL", "Entered result value", "Nullable until completed"],
      ["kpi_score", "DECIMAL", "6,2", "NULL", "Score 0–100", "Nullable until completed"],
      ["remarks", "TEXT", "—", "NULL", "Result remarks", "Optional"],
      ["attachment_key", "TEXT", "—", "NULL", "Storage key for evidence file", "Optional"],
      ["attachment_name", "TEXT", "—", "NULL", "Original filename", "Optional"],
      ["attachment_mime", "TEXT", "—", "NULL", "MIME type", "Optional"],
      ["result_updated_at", "TIMESTAMP", "—", "NULL", "When result last saved", "Nullable"],
      ["result_updated_by_id", "BIGINT", "—", "NULL", "FK → employees.id (RO)", "Nullable; FK PK"],
      ...auditCols,
    ],
  },
];

const NEW_ENUMS = [
  ["AssessmentCycle", "Q1, Q2, Q3, Q4", "kpi_framework_items.assessment_cycle"],
  ["KpiTargetDirection", "higher_is_better, lower_is_better", "kpi_framework_items.target_direction"],
  ["KpiRowStatus", "draft, pending_result, completed", "kpi_framework_items.status"],
];

const { book, file } = loadBook();
const names = new Set(TABLES.map((t) => t.name));

const index = sheetToRows(book, "00_Index");
let insertAt = index.findIndex(
  (r, i) => i > 0 && (r[0] === "" || r[0] === "Document" || String(r[0]) === "Document")
);
if (insertAt < 0) insertAt = index.length;

for (const t of TABLES) {
  const exists = index.some((r, i) => i > 0 && String(r[1]).toLowerCase() === t.name);
  if (!exists) {
    index.splice(insertAt, 0, [t.no, t.name, t.purpose, t.fields.length]);
    insertAt += 1;
  } else {
    for (const row of index) {
      if (String(row[1]).toLowerCase() === t.name) {
        row[0] = t.no;
        row[2] = t.purpose;
        row[3] = t.fields.length;
      }
    }
  }
}
for (const row of index) {
  if (String(row[0]) === "Generated") row[1] = istStamp();
}
writeSheet(book, "00_Index", index);

const fields = sheetToRows(book, "01_Table_Fields");
const header = fields[0] ?? [
  "Table No.",
  "Table Name",
  "Field No.",
  "Field Name",
  "Data Type",
  "Size",
  "Default Value",
  "Remarks",
  "Rule",
];
const kept = fields.filter((r, i) => i === 0 || !names.has(String(r[1]).toLowerCase()));
const fieldRows = [];
for (const t of TABLES) {
  t.fields.forEach((f, i) => {
    fieldRows.push([t.no, t.name, i + 1, ...f]);
  });
}
writeSheet(book, "01_Table_Fields", [header, ...kept.slice(1), ...fieldRows]);

const enums = sheetToRows(book, "02_Enums");
for (const [name, values, used] of NEW_ENUMS) {
  const has = enums.some((r, i) => i > 0 && String(r[0]) === name);
  if (!has) enums.push([name, values, used]);
}
writeSheet(book, "02_Enums", enums);

const out = file.includes("UPDATED") ? file : canonical;
try {
  XLSX.writeFile(book, out);
  console.log(`Wrote ${out}`);
} catch (e) {
  const alt = path.join(root, "docs", "OneView_Table_Structure_UPDATED.xlsx");
  XLSX.writeFile(book, alt);
  console.log(`Canonical locked; wrote ${alt}`, e instanceof Error ? e.message : e);
}
