/**
 * Apply PK-FK column doc updates to docs/OneView_Table_Structure.xlsx
 *
 * Replaces (match live Prisma + Postgres):
 *   weekly_check_in_competencies.department_code → department_id BIGINT FK → departments.id
 *   projects.customer → customer_id BIGINT FK → customers.id
 *   allocations.activity → activity_id BIGINT FK → activities.id
 *
 * If the canonical file is locked (EBUSY/EPERM), writes
 * docs/OneView_Table_Structure_UPDATED.xlsx instead.
 *
 * Usage: node scripts/apply-table-structure-fk-doc.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const canonicalPath = path.join(root, 'docs', 'OneView_Table_Structure.xlsx');
const fallbackPath = path.join(root, 'docs', 'OneView_Table_Structure_UPDATED.xlsx');

/** @type {Record<string, { fieldName: string, dataType: string, size: string, defaultValue: string, remarks: string, rule: string }>} */
const REPLACEMENTS = {
  department_code: {
    fieldName: 'department_id',
    dataType: 'BIGINT',
    size: '—',
    defaultValue: '—',
    remarks: 'FK → departments.id',
    rule: 'Required; FK; Indexed with is_deleted; ON DELETE RESTRICT',
  },
  customer: {
    fieldName: 'customer_id',
    dataType: 'BIGINT',
    size: '—',
    defaultValue: '—',
    remarks:
      'FK → customers.id (API may still expose customer name as derived display)',
    rule: 'Required; FK; Indexed',
  },
  activity: {
    fieldName: 'activity_id',
    dataType: 'BIGINT',
    size: '—',
    defaultValue: '—',
    remarks: 'FK → activities.id',
    rule: 'Required; FK; Indexed; ON DELETE RESTRICT',
  },
};

/** Only replace these (table, oldField) pairs — avoid unrelated `activity` / `customer` columns */
const TARGETS = [
  { table: 'weekly_check_in_competencies', oldField: 'department_code' },
  { table: 'projects', oldField: 'customer' },
  { table: 'allocations', oldField: 'activity' },
];

function istStamp() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
}

function applyFieldUpdates(rows) {
  /** @type {string} */
  let currentTable = '';
  const applied = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[1]) currentTable = String(row[1]);
    const fieldName = String(row[3] ?? '');

    for (const t of TARGETS) {
      if (currentTable === t.table && fieldName === t.oldField) {
        const rep = REPLACEMENTS[t.oldField];
        row[3] = rep.fieldName;
        row[4] = rep.dataType;
        row[5] = rep.size;
        row[6] = rep.defaultValue;
        row[7] = rep.remarks;
        row[8] = rep.rule;
        applied.push(`${t.table}.${t.oldField} → ${rep.fieldName}`);
      }
    }
  }

  return applied;
}

function updateIndexMeta(rows) {
  for (const row of rows) {
    if (row[0] === 'Generated') {
      row[1] = istStamp();
    }
    if (row[0] === 'Note') {
      row[1] =
        'App domain tables only (excludes _prisma_migrations). FK columns use BIGINT PKs (department_id, customer_id, activity_id). Tables 1–12 may still lag other schema details.';
    }
  }
}

function writeWorkbook(wb, dest) {
  XLSX.writeFile(wb, dest);
}

function main() {
  if (!fs.existsSync(canonicalPath)) {
    console.error(`Missing workbook: ${canonicalPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(canonicalPath);
  const fieldsSheet = wb.Sheets['01_Table_Fields'];
  const indexSheet = wb.Sheets['00_Index'];
  if (!fieldsSheet || !indexSheet) {
    console.error('Expected sheets 00_Index and 01_Table_Fields');
    process.exit(1);
  }

  const fieldRows = XLSX.utils.sheet_to_json(fieldsSheet, {
    header: 1,
    defval: '',
  });
  const applied = applyFieldUpdates(fieldRows);
  if (applied.length !== TARGETS.length) {
    console.error(
      `Expected ${TARGETS.length} replacements, applied ${applied.length}:`,
      applied,
    );
    process.exit(1);
  }

  const indexRows = XLSX.utils.sheet_to_json(indexSheet, {
    header: 1,
    defval: '',
  });
  updateIndexMeta(indexRows);

  wb.Sheets['01_Table_Fields'] = XLSX.utils.aoa_to_sheet(fieldRows);
  wb.Sheets['00_Index'] = XLSX.utils.aoa_to_sheet(indexRows);

  let writtenPath = canonicalPath;
  try {
    writeWorkbook(wb, canonicalPath);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
    if (code === 'EBUSY' || code === 'EPERM') {
      writeWorkbook(wb, fallbackPath);
      writtenPath = fallbackPath;
      console.warn(
        `Canonical file locked (${code}); wrote fallback: ${fallbackPath}`,
      );
    } else {
      throw err;
    }
  }

  // Verify read-back
  const verify = XLSX.readFile(writtenPath);
  const verifyRows = XLSX.utils.sheet_to_json(verify.Sheets['01_Table_Fields'], {
    header: 1,
    defval: '',
  });
  let cur = '';
  const found = { department_id: false, customer_id: false, activity_id: false };
  const oldGone = { department_code: true, customer: true, activity: true };
  for (let i = 1; i < verifyRows.length; i++) {
    const r = verifyRows[i];
    if (r[1]) cur = String(r[1]);
    const f = String(r[3] ?? '');
    if (cur === 'weekly_check_in_competencies' && f === 'department_id')
      found.department_id = true;
    if (cur === 'weekly_check_in_competencies' && f === 'department_code')
      oldGone.department_code = false;
    if (cur === 'projects' && f === 'customer_id') found.customer_id = true;
    if (cur === 'projects' && f === 'customer') oldGone.customer = false;
    if (cur === 'allocations' && f === 'activity_id') found.activity_id = true;
    if (cur === 'allocations' && f === 'activity') oldGone.activity = false;
  }

  console.log('Applied:', applied.join('; '));
  console.log('Written:', writtenPath);
  console.log('Verify new columns present:', found);
  console.log('Verify old columns gone:', oldGone);

  const ok =
    found.department_id &&
    found.customer_id &&
    found.activity_id &&
    oldGone.department_code &&
    oldGone.customer &&
    oldGone.activity;
  if (!ok) {
    console.error('Verification failed');
    process.exit(1);
  }
}

main();
