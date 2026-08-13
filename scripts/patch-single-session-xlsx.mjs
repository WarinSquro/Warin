/**
 * Document single-active-session columns on employees + refresh_tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const xlsxPath = path.resolve("docs/OneView_Table_Structure.xlsx");
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

// 01_Table_Fields
{
  const fields = wb.Sheets["01_Table_Fields"];
  const rows = XLSX.utils.sheet_to_json(fields, { header: 1, defval: "" });
  const header = rows[0] || [];
  let added = 0;
  if (
    ensureField(rows, header, "employees", "active_session_id", {
      "Data Type": "TEXT / VARCHAR",
      Size: "64",
      "Default Value": "NULL",
      Remarks: "Current sole active login session id (JWT sid)",
      Rule: "Optional; Cleared on logout; Replaced on forced re-login",
    })
  )
    added++;

  const refreshFields = [
    ["session_id", "TEXT / VARCHAR", "64", "—", "Login session id shared by refresh row + JWT sid", "Required; Indexed; Not unique (rotation keeps sid)"],
    ["user_agent", "TEXT", "—", "NULL", "Client User-Agent at login (display only)", "Optional"],
    ["ip_address", "TEXT / VARCHAR", "64", "NULL", "Client IP at login (display only)", "Optional"],
    ["device_label", "TEXT / VARCHAR", "100", "NULL", "Parsed device label for conflict UI", "Optional"],
    ["browser_label", "TEXT / VARCHAR", "100", "NULL", "Parsed browser label for conflict UI", "Optional"],
    ["last_seen_at", "TIMESTAMP", "—", "now()", "Last authenticated activity for this session", "System-set on validate/refresh"],
  ];

  // Ensure refresh_tokens table rows exist (workbook may omit the table).
  const tableCol = header.indexOf("Table Name");
  const hasRefresh = rows.some((r) => r[tableCol] === "refresh_tokens");
  if (!hasRefresh) {
    const base = [
      "",
      "refresh_tokens",
      1,
      "id",
      "BIGINT",
      "—",
      "identity",
      "Surrogate PK",
      "PK; Required",
      "",
    ];
    if (header.indexOf("Table No.") >= 0) base[0] = 22;
    rows.push(base);
    const more = [
      ["employee_id", "BIGINT", "—", "—", "FK → employees.id", "Required; Indexed"],
      ["token_hash", "TEXT / VARCHAR", "64", "—", "SHA-256 of opaque refresh token", "Required; Unique"],
      ["expires_at", "TIMESTAMP", "—", "—", "Refresh expiry", "Required"],
      ["revoked_at", "TIMESTAMP", "—", "NULL", "Set on logout / rotation / takeover", "Optional"],
      ["created_at", "TIMESTAMP", "—", "now()", "Created", "System-set"],
    ];
    let n = 2;
    for (const [name, type, size, def, remarks, rule] of more) {
      const row = [...base];
      row[header.indexOf("Field No.")] = n++;
      row[header.indexOf("Field Name")] = name;
      row[header.indexOf("Data Type")] = type;
      row[header.indexOf("Size")] = size;
      row[header.indexOf("Default Value")] = def;
      row[header.indexOf("Remarks")] = remarks;
      row[header.indexOf("Rule")] = rule;
      rows.push(row);
    }
    added += 1 + more.length;
  }

  for (const [name, type, size, def, remarks, rule] of refreshFields) {
    if (
      ensureField(rows, header, "refresh_tokens", name, {
        "Data Type": type,
        Size: size,
        "Default Value": def,
        Remarks: remarks,
        Rule: rule,
      })
    )
      added++;
  }

  wb.Sheets["01_Table_Fields"] = XLSX.utils.aoa_to_sheet(rows);

  // 00_Index — bump employees field count; add refresh_tokens if missing
  const idxSheet = wb.Sheets["00_Index"];
  const idxRows = XLSX.utils.sheet_to_json(idxSheet, { header: 1, defval: "" });
  const idxHeader = idxRows[0] || [];
  const nameI = idxHeader.indexOf("Table Name");
  const countI = idxHeader.indexOf("Field Count");
  const purposeI = idxHeader.indexOf("Purpose");
  const noI = idxHeader.indexOf("Table No.");
  for (const r of idxRows.slice(1)) {
    if (r[nameI] === "employees" && countI >= 0) {
      const n = Number(r[countI]) || 0;
      if (n > 0) r[countI] = n + 1;
    }
  }
  if (!idxRows.some((r) => r[nameI] === "refresh_tokens")) {
    const maxNo = idxRows.slice(1).reduce((m, r) => Math.max(m, Number(r[noI]) || 0), 0);
    const fieldCount = rows.filter((r) => r[tableCol] === "refresh_tokens").length;
    const row = [];
    while (row.length < idxHeader.length) row.push("");
    if (noI >= 0) row[noI] = maxNo + 1;
    if (nameI >= 0) row[nameI] = "refresh_tokens";
    if (purposeI >= 0) row[purposeI] = "Auth refresh tokens + single-session metadata";
    if (countI >= 0) row[countI] = fieldCount;
    idxRows.push(row);
  } else {
    for (const r of idxRows.slice(1)) {
      if (r[nameI] === "refresh_tokens" && countI >= 0) {
        r[countI] = rows.filter((row) => row[tableCol] === "refresh_tokens").length;
      }
    }
  }
  wb.Sheets["00_Index"] = XLSX.utils.aoa_to_sheet(idxRows);

  // 03_Auth_Notes
  const authSheet = wb.Sheets["03_Auth_Notes"];
  if (authSheet) {
    const authRows = XLSX.utils.sheet_to_json(authSheet, { header: 1, defval: "" });
    const note = [
      "Single active session",
      "One active login per employee: employees.active_session_id + JWT sid; login conflict returns continueToken; POST /auth/login/continue revokes others",
    ];
    const already = authRows.some((r) => String(r[0]).includes("Single active session"));
    if (!already) authRows.push(note);
    wb.Sheets["03_Auth_Notes"] = XLSX.utils.aoa_to_sheet(authRows);
  }

  XLSX.writeFile(wb, xlsxPath);
  console.log(`Updated OneView_Table_Structure.xlsx (+${added} field rows)`);
}
