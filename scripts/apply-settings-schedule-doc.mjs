/**
 * Sync app_settings_schedule (FR-033) into OneView_Table_Structure.xlsx
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

const TABLE_NO = 24;
const TABLE = "app_settings_schedule";
const PURPOSE = "Effective-dated Settings schedules (FR-033)";

const FIELDS = [
  ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
  ["effective_date", "DATE", "—", "—", "When pending payload becomes active", "Required; Indexed with status"],
  ["status", "ENUM(SettingsScheduleStatus)", "—", "pending", "pending|applied|cancelled|superseded", "Required"],
  ["payload", "JSONB", "—", "—", "Full target settings + companyOffDays", "Required"],
  ["change_summary", "TEXT", "—", "—", "Human-readable diff for banners/audit", "Required"],
  ["created_by_id", "BIGINT", "—", "NULL", "FK → employees.id", "Nullable; FK; ON DELETE SET NULL"],
  ["applied_at", "TIMESTAMP", "—", "NULL", "When status became applied", "Nullable"],
  ["cancelled_at", "TIMESTAMP", "—", "NULL", "When status became cancelled", "Nullable"],
  ["created_at", "TIMESTAMP", "—", "now()", "Created at", "Required"],
  ["modified_at", "TIMESTAMP", "—", "updatedAt", "Last modified", "Required"],
];

const { book, file } = loadBook();

const index = sheetToRows(book, "00_Index");
const hasIndex = index.some((r, i) => i > 0 && String(r[1]).toLowerCase() === TABLE);
if (!hasIndex) {
  let insertAt = index.findIndex(
    (r, i) => i > 0 && (r[0] === "" || r[0] === "Document" || String(r[0]) === "Document")
  );
  if (insertAt < 0) insertAt = index.length;
  index.splice(insertAt, 0, [TABLE_NO, TABLE, PURPOSE, FIELDS.length]);
}
for (const row of index) {
  if (String(row[0]) === "Generated") row[1] = istStamp();
}
writeSheet(book, "00_Index", index);

const fields = sheetToRows(book, "01_Table_Fields");
const cleaned = fields.filter((r, i) => i === 0 || String(r[1]).toLowerCase() !== TABLE);
let fieldNo = 1;
for (const [name, type, size, def, remarks, rule] of FIELDS) {
  cleaned.push([TABLE_NO, TABLE, fieldNo++, name, type, size, def, remarks, rule]);
}
writeSheet(book, "01_Table_Fields", cleaned);

const enums = sheetToRows(book, "02_Enums");
const enumNameCol = (enums[0] ?? []).findIndex((h) => String(h).toLowerCase().includes("enum"));
const hasEnum = enums.some(
  (r, i) => i > 0 && String(r[enumNameCol] ?? "").includes("SettingsScheduleStatus")
);
if (!hasEnum) {
  const eproto = enums[1] ?? enums[0] ?? [];
  for (const val of ["pending", "applied", "cancelled", "superseded"]) {
    const row = eproto.map(() => "");
    if (enumNameCol >= 0) row[enumNameCol] = "SettingsScheduleStatus";
    (enums[0] ?? []).forEach((h, i) => {
      const key = String(h).toLowerCase();
      if (key.includes("value")) row[i] = val;
      if (key.includes("note") || key.includes("label")) row[i] = val;
    });
    enums.push(row);
  }
}
writeSheet(book, "02_Enums", enums);

let out = file;
try {
  XLSX.writeFile(book, canonical);
  out = canonical;
} catch {
  XLSX.writeFile(book, fallback);
  out = fallback;
}
console.log("Wrote", out);
