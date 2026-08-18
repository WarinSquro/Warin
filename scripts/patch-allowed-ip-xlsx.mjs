/**
 * Document employees.allowed_ip on the table structure workbook.
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

function ensureField(rows, header, tableName, fieldName, patch) {
  const tableCol = header.indexOf("Table Name");
  const fieldCol = header.indexOf("Field Name");
  const exists = rows.some(
    (r) => r[tableCol] === tableName && String(r[fieldCol]) === fieldName
  );
  if (exists) return false;
  const sample = rows.find((r) => r[tableCol] === tableName) || rows[1] || [];
  const next = Array.isArray(sample) ? [...sample] : [];
  while (next.length < header.length) next.push("");
  const tableNoCol = header.indexOf("Table No.");
  const fieldNoCol = header.indexOf("Field No.");
  if (tableNoCol >= 0) next[tableNoCol] = sample[tableNoCol] ?? "";
  if (fieldCol >= 0) next[fieldCol] = fieldName;
  if (tableCol >= 0) next[tableCol] = tableName;
  const sameTable = rows.filter((r) => r[tableCol] === tableName);
  if (fieldNoCol >= 0) {
    const maxNo = sameTable.reduce((m, r) => Math.max(m, Number(r[fieldNoCol]) || 0), 0);
    next[fieldNoCol] = maxNo + 1;
  }
  for (const [colName, value] of Object.entries(patch)) {
    const i = header.indexOf(colName);
    if (i >= 0) next[i] = value;
  }
  rows.push(next);
  return true;
}

const fields = wb.Sheets["01_Table_Fields"];
const rows = XLSX.utils.sheet_to_json(fields, { header: 1, defval: "" });
const header = rows[0] || [];
const added = ensureField(rows, header, "employees", "allowed_ip", {
  "Data Type": "VARCHAR",
  Size: "45",
  "Default Value": "NULL",
  Remarks: "Optional login IP restriction (IPv4/IPv6). NULL = any IP.",
  Rule: "Optional; Valid IP when set; Enforced at login",
});
wb.Sheets["01_Table_Fields"] = XLSX.utils.aoa_to_sheet(rows);

const idxSheet = wb.Sheets["00_Index"];
if (idxSheet && added) {
  const idxRows = XLSX.utils.sheet_to_json(idxSheet, { header: 1, defval: "" });
  const idxHeader = idxRows[0] || [];
  const nameI = idxHeader.indexOf("Table Name");
  const countI = idxHeader.indexOf("Field Count");
  for (const r of idxRows.slice(1)) {
    if (r[nameI] === "employees" && countI >= 0) {
      const n = Number(r[countI]) || 0;
      if (n > 0) r[countI] = n + 1;
    }
  }
  wb.Sheets["00_Index"] = XLSX.utils.aoa_to_sheet(idxRows);
}

const authSheet = wb.Sheets["03_Auth_Notes"];
if (authSheet) {
  const authRows = XLSX.utils.sheet_to_json(authSheet, { header: 1, defval: "" });
  const already = authRows.some((r) => String(r[0]).includes("Allowed IP"));
  if (!already) {
    authRows.push([
      "Allowed IP",
      "employees.allowed_ip: when set, POST /auth/login (and /login/continue) require the reverse-proxy client IP to match. Empty/NULL = no restriction. IP is taken from the connection (req.ip), not from the request body.",
    ]);
  }
  wb.Sheets["03_Auth_Notes"] = XLSX.utils.aoa_to_sheet(authRows);
}

XLSX.writeFile(wb, xlsxPath);
console.log(added ? "Updated OneView_Table_Structure.xlsx (employees.allowed_ip)" : "allowed_ip already documented");
