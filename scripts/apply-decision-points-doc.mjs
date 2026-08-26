/**
 * Sync decision_points + decision_point_actions + id_sequences into
 * docs/OneView_Table_Structure.xlsx (tables 33–35) + enums.
 * Run: node scripts/apply-decision-points-doc.mjs
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

const TABLES = [
  {
    no: 33,
    name: "id_sequences",
    purpose: "Named counters (e.g. Decision Point codes by year)",
    fields: [
      ["name", "TEXT", "—", "—", "Sequence name PK", "PK; Required"],
      ["next_value", "BIGINT", "—", "1", "Next value to allocate", "Required"],
    ],
  },
  {
    no: 34,
    name: "decision_points",
    purpose: "Operational Decision Points (My Team)",
    fields: [
      ["id", "BIGINT", "—", "autoincrement()", "Surrogate PK", "PK; Required"],
      ["point_code", "TEXT", "—", "—", "Business id e.g. DP-2026-00001", "Required; Unique"],
      ["type_id", "BIGINT", "—", "—", "FK → decision_point_types.id", "Required; FK PK"],
      ["subject", "TEXT", "—", "—", "Point title", "Required"],
      ["remarks", "TEXT", "—", "—", "Raiser remarks", "Required"],
      ["status", "ENUM", "DecisionPointStatus", "pending_ro_action", "Lifecycle status", "Required"],
      ["raised_by_id", "BIGINT", "—", "—", "FK → employees.id", "Required; FK PK"],
      ["current_owner_id", "BIGINT", "—", "NULL", "RO who must act", "Nullable; FK PK"],
      ["immediate_owner_id", "BIGINT", "—", "—", "First RO at raise", "Required; FK PK"],
      ["previous_owner_id", "BIGINT", "—", "NULL", "Prior RO on escalate", "Nullable; FK PK"],
      ["allocation_id", "BIGINT", "—", "NULL", "FK → allocations.id", "Nullable; FK PK"],
      ["escalation_level", "INTEGER", "—", "0", "Escalate count", "Required"],
      ["last_action_at", "TIMESTAMP", "—", "NULL", "Last action time", "Nullable"],
      ["closed_at", "TIMESTAMP", "—", "NULL", "Close time", "Nullable"],
      ["final_actor_id", "BIGINT", "—", "NULL", "Who closed", "Nullable; FK PK"],
      ...auditCols,
    ],
  },
  {
    no: 35,
    name: "decision_point_actions",
    purpose: "Immutable Decision Point audit trail",
    fields: [
      ["id", "BIGINT", "—", "autoincrement()", "Surrogate PK", "PK; Required"],
      ["decision_point_id", "BIGINT", "—", "—", "FK → decision_points.id", "Required; FK PK"],
      ["action_type", "ENUM", "DecisionPointActionType", "—", "raised|…|self_resolved", "Required"],
      ["performed_by_id", "BIGINT", "—", "—", "FK → employees.id", "Required; FK PK"],
      ["remarks", "TEXT", "—", "—", "Mandatory rationale", "Required"],
      ["previous_status", "ENUM", "DecisionPointStatus", "—", "Prior status", "Required"],
      ["new_status", "ENUM", "DecisionPointStatus", "—", "New status", "Required"],
      ["previous_owner_id", "BIGINT", "—", "NULL", "Prior RO", "Nullable; FK PK"],
      ["next_owner_id", "BIGINT", "—", "NULL", "Next RO on escalate", "Nullable; FK PK"],
      ["created_at", "TIMESTAMP", "—", "now()", "Append-only", "Required; Immutable"],
    ],
  },
];

const ENUMS = [
  [
    "DecisionPointStatus",
    "pending_ro_action | escalated_pending_next_ro | acknowledged_closed | approved_closed | rejected_closed | self_resolved_closed",
    "decision_points.status",
    "Decision Point lifecycle",
  ],
  [
    "DecisionPointActionType",
    "raised | acknowledged_close | approved_close | rejected_close | recommend_escalate | self_resolved",
    "decision_point_actions.action_type",
    "Trail action kinds",
  ],
];

function upsertIndex(rows) {
  const header = rows[0] ?? ["No", "Table", "Purpose", "Updated"];
  const names = new Set(TABLES.map((t) => t.name));
  const body = rows.slice(1).filter((r) => !names.has(String(r[1] ?? "")));
  for (const t of TABLES) body.push([t.no, t.name, t.purpose, istStamp()]);
  body.sort((a, b) => Number(a[0]) - Number(b[0]));
  return [header, ...body];
}

function upsertFields(rows) {
  const header =
    rows[0] ??
    ["Table No", "Table", "Field No", "Field", "Data Type", "Size/Enum", "Default", "Remarks", "Rule"];
  const names = new Set(TABLES.map((t) => t.name));
  const body = rows.slice(1).filter((r) => !names.has(String(r[1] ?? "")));
  for (const t of TABLES) {
    t.fields.forEach((f, i) => body.push([t.no, t.name, i + 1, ...f]));
  }
  body.sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[2]) - Number(b[2]));
  return [header, ...body];
}

function upsertEnums(rows) {
  const header = rows[0] ?? ["Enum", "Values", "Used By", "Notes"];
  const names = new Set(ENUMS.map((e) => e[0]));
  const body = rows.slice(1).filter((r) => !names.has(String(r[0] ?? "")));
  for (const e of ENUMS) body.push(e);
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
console.log(`Updated ${out} with decision_points tables T33–T35`);
