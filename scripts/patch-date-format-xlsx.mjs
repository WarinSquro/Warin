/**
 * Append date_format column docs to OneView_Table_Structure.xlsx (app_settings).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const xlsxPath = path.resolve("docs/OneView_Table_Structure.xlsx");
const wb = XLSX.readFile(xlsxPath);
const fields = wb.Sheets["01_Table_Fields"];
const rows = XLSX.utils.sheet_to_json(fields, { header: 1, defval: "" });
const header = rows[0] || [];
const col = (name) => header.indexOf(name);

const tableCol = col("Table");
const fieldCol = col("Field / Column");
const already = rows.some(
  (r) => r[tableCol] === "app_settings" && String(r[fieldCol]).includes("date_format")
);

if (!already) {
  const sample = rows.find((r) => r[tableCol] === "app_settings") || [];
  const next = [...sample];
  if (fieldCol >= 0) next[fieldCol] = "date_format";
  const typeCol = col("Data Type");
  if (typeCol >= 0) next[typeCol] = "TEXT";
  const nullCol = col("Nullable");
  if (nullCol >= 0) next[nullCol] = "NO";
  const defCol = col("Default");
  if (defCol >= 0) next[defCol] = "dd/MM/yyyy";
  const descCol = col("Description");
  if (descCol >= 0) next[descCol] = "App-wide date display pattern";
  const notesCol = col("Notes");
  if (notesCol >= 0) next[notesCol] = "dd/MM/yyyy | MM/dd/yyyy | yyyy-MM-dd | dd-MMM-yyyy";
  rows.push(next);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets["01_Table_Fields"] = sheet;
  XLSX.writeFile(wb, xlsxPath);
  console.log("Added app_settings.date_format to 01_Table_Fields");
} else {
  console.log("app_settings.date_format already documented");
}
