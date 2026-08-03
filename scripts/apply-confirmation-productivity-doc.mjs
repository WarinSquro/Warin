/**
 * Sync confirmation productivity tables into OneView_Table_Structure.xlsx
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

function upsertTable(book, tableNo, tableName, purpose, fields) {
  const index = sheetToRows(book, "00_Index");
  const hasIndex = index.some((r, i) => i > 0 && String(r[1]).toLowerCase() === tableName);
  if (!hasIndex) {
    let insertAt = index.findIndex(
      (r, i) => i > 0 && (r[0] === "" || r[0] === "Document" || String(r[0]) === "Document")
    );
    if (insertAt < 0) insertAt = index.length;
    index.splice(insertAt, 0, [tableNo, tableName, purpose, fields.length]);
  } else {
    for (const row of index) {
      if (String(row[1]).toLowerCase() === tableName) {
        row[0] = tableNo;
        row[2] = purpose;
        row[3] = fields.length;
      }
    }
  }
  for (const row of index) {
    if (String(row[0]) === "Generated") row[1] = istStamp();
  }
  writeSheet(book, "00_Index", index);

  const fieldRows = sheetToRows(book, "01_Table_Fields");
  const header =
    fieldRows[0] ?? [
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
  const cleaned = fieldRows.filter((r, i) => i === 0 || String(r[1]).toLowerCase() !== tableName);
  if (cleaned.length === 0 || cleaned[0][0] !== header[0]) cleaned.unshift(header);
  let fieldNo = 1;
  for (const [name, type, size, def, remarks, rule] of fields) {
    cleaned.push([tableNo, tableName, fieldNo++, name, type, size, def, remarks, rule]);
  }
  writeSheet(book, "01_Table_Fields", cleaned);
}

const DAY_FIELDS = [
  ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
  ["employee_id", "BIGINT", "—", "—", "FK → employees.id", "Required; FK; ON DELETE CASCADE; Unique with work_date"],
  ["work_date", "DATE", "—", "—", "Calendar work day for timeline/timers", "Required; Unique with employee_id"],
  ["day_start_at", "TIMESTAMP", "—", "NULL", "Day Start stamp", "Optional; one-time per day"],
  ["lunch_out_at", "TIMESTAMP", "—", "NULL", "Lunch Out stamp", "Optional; one-time per day"],
  ["lunch_in_at", "TIMESTAMP", "—", "NULL", "Lunch In stamp", "Optional; one-time per day"],
  ["day_end_at", "TIMESTAMP", "—", "NULL", "Day End stamp", "Optional; one-time per day"],
  ["work_hours_snapshot", "DOUBLE PRECISION", "—", "NULL", "Live/submitted Total (Planned/Unplan.) Work Hours", "Optional"],
  ["active_allocation_key", "TEXT", "—", "NULL", "UI key of running focus timer", "Optional"],
  ["is_active", "BOOLEAN", "—", "true", "Soft-active flag", "Required"],
  ["is_deleted", "BOOLEAN", "—", "false", "Soft-delete flag", "Required"],
  ["deleted_at", "TIMESTAMP", "—", "NULL", "Soft-delete time", "Optional"],
  ["created_at", "TIMESTAMP", "—", "now()", "Row create time", "System-set"],
  ["modified_at", "TIMESTAMP", "—", "auto", "Last update time", "System-set"],
  ["created_by", "BIGINT", "—", "NULL", "Actor employee id", "Optional"],
  ["modified_by", "BIGINT", "—", "NULL", "Last modifier employee id", "Optional"],
  ["version", "INTEGER", "—", "1", "Optimistic concurrency", "Required"],
];

const SESSION_FIELDS = [
  ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
  ["day_id", "BIGINT", "—", "—", "FK → confirmation_productivity_days.id", "Required; FK; ON DELETE CASCADE; Unique with allocation_key"],
  ["allocation_id", "BIGINT", "—", "NULL", "FK → allocations.id when key is numeric", "Nullable; FK; ON DELETE SET NULL"],
  ["allocation_key", "TEXT", "—", "—", "UI allocation key (id or orphan-*)", "Required; Unique with day_id"],
  ["session_accum_ms", "INTEGER", "—", "0", "Paused/open session accumulated ms", "Required; Non-negative"],
  ["segment_started_at", "TIMESTAMP", "—", "NULL", "Current run segment start; null if paused", "Optional"],
  ["created_at", "TIMESTAMP", "—", "now()", "Row create time", "System-set"],
  ["modified_at", "TIMESTAMP", "—", "auto", "Last update time", "System-set"],
];

const LAP_FIELDS = [
  ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
  ["day_id", "BIGINT", "—", "—", "FK → confirmation_productivity_days.id", "Required; FK; ON DELETE CASCADE"],
  ["allocation_id", "BIGINT", "—", "NULL", "FK → allocations.id when key is numeric", "Nullable; FK; ON DELETE SET NULL"],
  ["allocation_key", "TEXT", "—", "—", "UI allocation key for the lap", "Required; Indexed with day_id"],
  ["started_at", "TIMESTAMP", "—", "—", "Lap start instant", "Required"],
  ["ended_at", "TIMESTAMP", "—", "—", "Lap end instant (Stop)", "Required"],
  ["duration_ms", "INTEGER", "—", "—", "Completed lap duration in ms", "Required; Non-negative"],
  ["created_at", "TIMESTAMP", "—", "now()", "Row create time", "System-set"],
];

const { book, file } = loadBook();
upsertTable(
  book,
  24,
  "confirmation_productivity_days",
  "Confirmation workday timeline + daily productivity snapshot",
  DAY_FIELDS
);
upsertTable(
  book,
  25,
  "confirmation_focus_sessions",
  "Open/paused focus timer sessions per allocation key",
  SESSION_FIELDS
);
upsertTable(
  book,
  26,
  "confirmation_focus_laps",
  "Completed focus timer laps (Stop) per allocation key",
  LAP_FIELDS
);

let out = file;
try {
  XLSX.writeFile(book, canonical);
  out = canonical;
} catch {
  XLSX.writeFile(book, fallback);
  out = fallback;
}
console.log("Wrote", out);
