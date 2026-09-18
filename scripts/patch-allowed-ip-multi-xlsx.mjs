/**
 * Ensure employees.allowed_ip is documented as VARCHAR(255) multi-IP.
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
const tableCol = col("Table Name");
const fieldCol = col("Field Name");
const fieldNoCol = col("Field No.");
const tableNoCol = col("Table No.");

const patch = {
  "Data Type": "VARCHAR",
  Size: "255",
  "Default Value": "NULL",
  Remarks:
    "Optional login IP restriction. Comma-separated IPv4/IPv6 (max 10). NULL/empty = any IP.",
  Rule: "Optional; Each value valid IP; Login matches any listed IP",
};

let row = rows.find((r) => r[tableCol] === "employees" && String(r[fieldCol]) === "allowed_ip");
if (!row) {
  const sample = rows.find((r) => r[tableCol] === "employees") || [];
  row = Array.isArray(sample) ? [...sample] : [];
  while (row.length < header.length) row.push("");
  if (tableNoCol >= 0) row[tableNoCol] = sample[tableNoCol] ?? "";
  if (tableCol >= 0) row[tableCol] = "employees";
  if (fieldCol >= 0) row[fieldCol] = "allowed_ip";
  if (fieldNoCol >= 0) {
    const maxNo = rows
      .filter((r) => r[tableCol] === "employees")
      .reduce((m, r) => Math.max(m, Number(r[fieldNoCol]) || 0), 0);
    row[fieldNoCol] = maxNo + 1;
  }
  rows.push(row);
  console.log("Added employees.allowed_ip row");
} else {
  console.log("Updating employees.allowed_ip row");
}

for (const [colName, value] of Object.entries(patch)) {
  const i = col(colName);
  if (i >= 0) row[i] = value;
}

wb.Sheets["01_Table_Fields"] = XLSX.utils.aoa_to_sheet(rows);

const authSheet = wb.Sheets["03_Auth_Notes"];
if (authSheet) {
  const authRows = XLSX.utils.sheet_to_json(authSheet, { header: 1, defval: "" });
  let found = false;
  for (const r of authRows) {
    if (String(r[0]).includes("Allowed IP")) {
      r[1] =
        "employees.allowed_ip: comma-separated IPs; POST /auth/login (and /login/continue) allow when reverse-proxy client IP matches any entry. Empty/NULL = no restriction. IP from connection (req.ip), not body.";
      found = true;
      break;
    }
  }
  if (!found) {
    authRows.push([
      "Allowed IP",
      "employees.allowed_ip: comma-separated IPs; login allows match on any entry. Empty/NULL = no restriction.",
    ]);
  }
  wb.Sheets["03_Auth_Notes"] = XLSX.utils.aoa_to_sheet(authRows);
}

XLSX.writeFile(wb, xlsxPath);
console.log("OneView_Table_Structure.xlsx updated for multi Allowed IP");
