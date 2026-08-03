/**
 * Sync project health columns + ProjectHealth enum into OneView_Table_Structure.xlsx
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

const { book, file } = loadBook();

// 01_Table_Fields — add health + health_remarks for projects if missing
const fields = sheetToRows(book, "01_Table_Fields");
const header = fields[0] ?? [];
const tableCol = header.findIndex((h) => String(h).toLowerCase().includes("table"));
const colCol = header.findIndex((h) => String(h).toLowerCase().includes("column") || String(h).toLowerCase() === "field");

function hasField(table, column) {
  return fields.some(
    (r, i) =>
      i > 0 &&
      String(r[tableCol] ?? "").toLowerCase() === table &&
      String(r[colCol] ?? "").toLowerCase() === column
  );
}

function sampleRow() {
  return fields.find((r, i) => i > 0 && String(r[tableCol]).toLowerCase() === "projects") ?? fields[1] ?? [];
}

const proto = sampleRow();
function makeFieldRow(column, type, notes) {
  const row = proto.map(() => "");
  if (tableCol >= 0) row[tableCol] = "projects";
  if (colCol >= 0) row[colCol] = column;
  // best-effort fill common columns by header name
  header.forEach((h, i) => {
    const key = String(h).toLowerCase();
    if (key.includes("data type") || key === "type") row[i] = type;
    if (key.includes("nullable")) row[i] = "NO";
    if (key.includes("default")) row[i] = type.includes("ENUM") ? "green" : "''";
    if (key.includes("note") || key.includes("remark") || key.includes("description")) row[i] = notes;
  });
  return row;
}

if (!hasField("projects", "health")) {
  fields.push(makeFieldRow("health", "ENUM(ProjectHealth)", "FR-147 portfolio health green/amber/red"));
}
if (!hasField("projects", "health_remarks")) {
  fields.push(
    makeFieldRow("health_remarks", "TEXT", "Required when health is amber or red (BR-025)")
  );
}
writeSheet(book, "01_Table_Fields", fields);

// 02_Enums — add ProjectHealth
const enums = sheetToRows(book, "02_Enums");
const enumNameCol = (enums[0] ?? []).findIndex((h) =>
  String(h).toLowerCase().includes("enum")
);
const hasEnum = enums.some(
  (r, i) => i > 0 && String(r[enumNameCol] ?? "").includes("ProjectHealth")
);
if (!hasEnum) {
  const eproto = enums[1] ?? enums[0] ?? [];
  for (const val of ["green", "amber", "red"]) {
    const row = eproto.map(() => "");
    if (enumNameCol >= 0) row[enumNameCol] = "ProjectHealth";
    (enums[0] ?? []).forEach((h, i) => {
      const key = String(h).toLowerCase();
      if (key.includes("value")) row[i] = val;
      if (key.includes("note") || key.includes("label")) {
        row[i] = val === "green" ? "Healthy" : val === "amber" ? "Needs Attention" : "Critical";
      }
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
