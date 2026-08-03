/**
 * Sync app_settings_audit (FR-616) into OneView_Table_Structure.xlsx
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

const TABLE_NO = 23;
const TABLE = "app_settings_audit";
const PURPOSE = "System Parameters change history (FR-616) — append-only";

const FIELDS = [
  ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
  ["what", "TEXT", "—", "—", "Human-readable field-level change summary", "Required"],
  ["who_name", "TEXT", "—", "—", "Display name of actor at change time", "Required; denormalized"],
  ["employee_id", "BIGINT", "—", "NULL", "FK → employees.id", "Nullable; FK; ON DELETE SET NULL"],
  ["created_at", "TIMESTAMP", "—", "now()", "When the change was applied", "Required; Indexed"],
];

const { book, file } = loadBook();

// 00_Index
const index = sheetToRows(book, "00_Index");
const hasIndex = index.some((r, i) => i > 0 && String(r[1]).toLowerCase() === TABLE);
if (!hasIndex) {
  // Insert before trailing metadata (empty row or Document row)
  let insertAt = index.findIndex((r, i) => i > 0 && (r[0] === "" || r[0] === "Document" || String(r[0]) === "Document"));
  if (insertAt < 0) insertAt = index.length;
  index.splice(insertAt, 0, [TABLE_NO, TABLE, PURPOSE, FIELDS.length]);
}
// Update Generated stamp if present
for (const row of index) {
  if (String(row[0]) === "Generated") row[1] = istStamp();
}
writeSheet(book, "00_Index", index);

// 01_Table_Fields — remove prior rows for this table then append
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
const cleaned = fields.filter((r, i) => i === 0 || String(r[1]).toLowerCase() !== TABLE);
let fieldNo = 1;
for (const [name, type, size, def, remarks, rule] of FIELDS) {
  cleaned.push([TABLE_NO, TABLE, fieldNo++, name, type, size, def, remarks, rule]);
}
writeSheet(book, "01_Table_Fields", cleaned);

let out = file;
try {
  XLSX.writeFile(book, canonical);
  out = canonical;
} catch {
  XLSX.writeFile(book, fallback);
  out = fallback;
}
console.log("Wrote", out);
