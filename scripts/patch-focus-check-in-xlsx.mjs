/**
 * Append focus_check_in_minutes column docs to OneView_Table_Structure.xlsx (app_settings).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const xlsxPath = path.resolve("docs/OneView_Table_Structure.xlsx");
if (!fs.existsSync(xlsxPath)) {
  console.error("Missing", xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const fields = wb.Sheets["01_Table_Fields"];
const rows = XLSX.utils.sheet_to_json(fields, { header: 1, defval: "" });
const header = rows[0] || [];
const col = (name) => header.indexOf(name);

const tableCol = col("Table");
const fieldCol = col("Field / Column");
const already = rows.some(
  (r) => r[tableCol] === "app_settings" && String(r[fieldCol]).includes("focus_check_in_minutes")
);

if (!already) {
  const sample = rows.find((r) => r[tableCol] === "app_settings") || [];
  const next = [...sample];
  if (fieldCol >= 0) next[fieldCol] = "focus_check_in_minutes";
  const typeCol = col("Data Type");
  if (typeCol >= 0) next[typeCol] = "INTEGER";
  const nullCol = col("Nullable");
  if (nullCol >= 0) next[nullCol] = "NO";
  const defCol = col("Default");
  if (defCol >= 0) next[defCol] = "0";
  const descCol = col("Description");
  if (descCol >= 0) {
    next[descCol] =
      "Focus timer check-in interval (minutes). 0=off; prompt Continue Focused Work every N min; 30s no response → auto-stop";
  }
  const notesCol = col("Notes");
  if (notesCol >= 0) next[notesCol] = "0–240; System Parameters";
  rows.push(next);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets["01_Table_Fields"] = sheet;
  XLSX.writeFile(wb, xlsxPath);
  console.log("Added app_settings.focus_check_in_minutes to 01_Table_Fields");
} else {
  console.log("app_settings.focus_check_in_minutes already documented");
}
