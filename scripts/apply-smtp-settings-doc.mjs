/**
 * Sync smtp_settings into OneView_Table_Structure.xlsx
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

const TABLE_NO = 27;
const TABLE = "smtp_settings";
const PURPOSE = "Org SMTP for outbound app email (Forgot PIN, notifications); password AES-GCM encrypted";

const FIELDS = [
  ["id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", "PK; Required; System-generated"],
  ["code", "TEXT", "—", "default", "Singleton key (default)", "Required; Unique"],
  ["host", "TEXT", "—", "''", "SMTP hostname", "Required when configured"],
  ["port", "INTEGER", "—", "587", "SMTP port", "Required"],
  ["security_type", "SmtpSecurityType", "—", "starttls", "none|ssl|tls|starttls", "Required; Enum"],
  ["sender_name", "TEXT", "—", "''", "From display name", "Required when configured"],
  ["sender_email", "TEXT", "—", "''", "From email address", "Required when configured"],
  ["username", "TEXT", "—", "''", "SMTP auth username", "Optional unless auth_required"],
  ["password_encrypted", "TEXT", "—", "NULL", "AES-256-GCM ciphertext (base64url)", "Nullable; never plaintext"],
  ["auth_required", "BOOLEAN", "—", "true", "Whether SMTP AUTH is used", "Required"],
  ["is_configured", "BOOLEAN", "—", "false", "Ready for product email", "Required"],
  ["is_active", "BOOLEAN", "—", "true", "Soft-active flag", "Required"],
  ["is_deleted", "BOOLEAN", "—", "false", "Soft-delete flag", "Required"],
  ["deleted_at", "TIMESTAMP", "—", "NULL", "Soft-delete time", "Nullable"],
  ["created_at", "TIMESTAMP", "—", "now()", "Created", "Required"],
  ["modified_at", "TIMESTAMP", "—", "updatedAt", "Last modified", "Required"],
  ["created_by", "BIGINT", "—", "NULL", "Actor employee id", "Nullable"],
  ["modified_by", "BIGINT", "—", "NULL", "Actor employee id", "Nullable"],
  ["version", "INTEGER", "—", "1", "Optimistic version", "Required"],
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
const header = fields[0] ?? [
  "Table No.",
  "Table Name",
  "Column",
  "Data Type",
  "Length/Precision",
  "Default",
  "Description",
  "Constraints / Notes",
];
const kept = fields.filter((r, i) => i === 0 || String(r[1]).toLowerCase() !== TABLE);
const fieldRows = FIELDS.map((f) => [TABLE_NO, TABLE, ...f]);
writeSheet(book, "01_Table_Fields", [header, ...kept.slice(1), ...fieldRows]);

const enums = sheetToRows(book, "02_Enums");
const enumName = "SmtpSecurityType";
const hasEnum = enums.some((r, i) => i > 0 && String(r[0]) === enumName);
if (!hasEnum) {
  enums.push([
    enumName,
    "none, ssl, tls, starttls",
    "SMTP security mode for smtp_settings.security_type",
    "smtp_settings",
  ]);
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
