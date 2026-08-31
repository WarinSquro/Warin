/**
 * Export WARIN Postgres schema (structure only, no row data) to Excel.
 * Source: local Docker `oneview-postgres` information_schema (not the incomplete workbook).
 *
 * Run: npx tsx scripts/export-warin-schema-xlsx.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(
  __dirname,
  "..",
  "backups",
  `WARIN_Database_Schema_NoData_${stamp}.xlsx`
);

function psqlJson(sql: string): unknown {
  const raw = execFileSync(
    "docker",
    ["exec", "oneview-postgres", "psql", "-U", "admin", "-d", "oneview", "-t", "-A", "-c", sql],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  ).trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

const tablesSql = `
SELECT COALESCE(json_agg(q ORDER BY q.table_name), '[]'::json)
FROM (
  SELECT
    c.relname AS table_name,
    obj_description(c.oid, 'pg_class') AS table_comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname <> '_prisma_migrations'
) q;
`;

const columnsSql = `
SELECT COALESCE(json_agg(q ORDER BY q.table_name, q.ordinal_position), '[]'::json)
FROM (
  SELECT
    c.table_name,
    c.ordinal_position,
    c.column_name,
    CASE
      WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
      WHEN c.data_type = 'ARRAY' THEN c.udt_name || '[]'
      WHEN c.data_type = 'character varying' THEN
        'VARCHAR(' || COALESCE(c.character_maximum_length::text, '') || ')'
      WHEN c.data_type = 'character' THEN
        'CHAR(' || COALESCE(c.character_maximum_length::text, '') || ')'
      WHEN c.data_type = 'numeric' THEN
        'NUMERIC(' || COALESCE(c.numeric_precision::text, '') || ',' || COALESCE(c.numeric_scale::text, '0') || ')'
      ELSE upper(c.data_type)
    END AS data_type,
    COALESCE(c.character_maximum_length::text, c.numeric_precision::text, '—') AS size,
    c.is_nullable,
    COALESCE(c.column_default, '—') AS column_default,
    col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) AS remarks
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name <> '_prisma_migrations'
) q;
`;

const pkSql = `
SELECT COALESCE(json_agg(q ORDER BY q.table_name, q.ordinal_position), '[]'::json)
FROM (
  SELECT
    tc.table_name,
    kcu.column_name,
    kcu.ordinal_position,
    tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name <> '_prisma_migrations'
) q;
`;

const fkSql = `
SELECT COALESCE(json_agg(q ORDER BY q.table_name, q.column_name), '[]'::json)
FROM (
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column,
    rc.update_rule,
    rc.delete_rule,
    tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
   AND rc.constraint_schema = tc.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name <> '_prisma_migrations'
) q;
`;

const uniqueSql = `
SELECT COALESCE(json_agg(q ORDER BY q.table_name, q.constraint_name, q.ordinal_position), '[]'::json)
FROM (
  SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'UNIQUE'
    AND tc.table_name <> '_prisma_migrations'
) q;
`;

const indexSql = `
SELECT COALESCE(json_agg(q ORDER BY q.table_name, q.index_name), '[]'::json)
FROM (
  SELECT
    t.relname AS table_name,
    i.relname AS index_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    pg_get_indexdef(ix.indexrelid) AS index_def
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname <> '_prisma_migrations'
) q;
`;

const enumSql = `
SELECT COALESCE(json_agg(q ORDER BY q.enum_name, q.sort_order), '[]'::json)
FROM (
  SELECT
    t.typname AS enum_name,
    e.enumlabel AS enum_value,
    e.enumsortorder AS sort_order
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
) q;
`;

type TableRow = { table_name: string; table_comment: string | null };
type ColRow = {
  table_name: string;
  ordinal_position: number;
  column_name: string;
  data_type: string;
  size: string;
  is_nullable: string;
  column_default: string;
  remarks: string | null;
};
type PkRow = { table_name: string; column_name: string; ordinal_position: number; constraint_name: string };
type FkRow = {
  table_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
  update_rule: string;
  delete_rule: string;
  constraint_name: string;
};
type UqRow = { table_name: string; constraint_name: string; column_name: string; ordinal_position: number };
type IxRow = {
  table_name: string;
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  index_def: string;
};
type EnRow = { enum_name: string; enum_value: string; sort_order: number };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A4B" } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  widths: number[],
  data: Array<Array<string | number>>
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(headers);
  styleHeader(ws.getRow(1));
  for (const r of data) ws.addRow(r);
  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = widths[i] ?? 18;
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, data.length + 1), column: headers.length },
  };
}

const tables = psqlJson(tablesSql) as TableRow[];
const columns = psqlJson(columnsSql) as ColRow[];
const pks = psqlJson(pkSql) as PkRow[];
const fks = psqlJson(fkSql) as FkRow[];
const uniques = psqlJson(uniqueSql) as UqRow[];
const indexes = psqlJson(indexSql) as IxRow[];
const enums = psqlJson(enumSql) as EnRow[];

const pkByTable = new Map<string, string[]>();
for (const p of pks) {
  const list = pkByTable.get(p.table_name) ?? [];
  list.push(p.column_name);
  pkByTable.set(p.table_name, list);
}

const fkByCol = new Map<string, FkRow[]>();
for (const f of fks) {
  const key = `${f.table_name}.${f.column_name}`;
  const list = fkByCol.get(key) ?? [];
  list.push(f);
  fkByCol.set(key, list);
}

const uqByCol = new Map<string, string[]>();
for (const u of uniques) {
  const key = `${u.table_name}.${u.column_name}`;
  const list = uqByCol.get(key) ?? [];
  list.push(u.constraint_name);
  uqByCol.set(key, list);
}

const enumByName = new Map<string, string[]>();
for (const e of enums) {
  const list = enumByName.get(e.enum_name) ?? [];
  list.push(e.enum_value);
  enumByName.set(e.enum_name, list);
}

const tableNos = new Map<string, number>();
tables.forEach((t, i) => tableNos.set(t.table_name, i + 1));

const wb = new ExcelJS.Workbook();
wb.creator = "WARIN";
wb.created = new Date();

addSheet(
  wb,
  "00_Index",
  ["#", "Table", "Columns", "Primary key", "Comment"],
  [6, 36, 12, 36, 50],
  tables.map((t) => [
    tableNos.get(t.table_name) ?? 0,
    t.table_name,
    columns.filter((c) => c.table_name === t.table_name).length,
    (pkByTable.get(t.table_name) ?? []).join(", ") || "—",
    t.table_comment ?? "—",
  ])
);

addSheet(
  wb,
  "01_Columns",
  [
    "Table #",
    "Table",
    "Col #",
    "Column",
    "Data type",
    "Size / length",
    "Nullable",
    "Default",
    "PK",
    "FK",
    "Unique",
    "Enum values",
    "Remarks",
  ],
  [10, 32, 8, 28, 28, 14, 10, 40, 8, 40, 18, 40, 40],
  columns.map((c) => {
    const fksFor = fkByCol.get(`${c.table_name}.${c.column_name}`) ?? [];
    const fkText = fksFor
      .map((f) => `${f.foreign_table}.${f.foreign_column} (ON DELETE ${f.delete_rule})`)
      .join("; ");
    const enumVals = enumByName.get(c.data_type)?.join(" | ") ?? "";
    const isPk = (pkByTable.get(c.table_name) ?? []).includes(c.column_name) ? "Yes" : "";
    const isUq = (uqByCol.get(`${c.table_name}.${c.column_name}`) ?? []).length ? "Yes" : "";
    return [
      tableNos.get(c.table_name) ?? 0,
      c.table_name,
      c.ordinal_position,
      c.column_name,
      c.data_type,
      c.size ?? "—",
      c.is_nullable === "YES" ? "YES" : "NO",
      c.column_default ?? "—",
      isPk,
      fkText || "",
      isUq,
      enumVals,
      c.remarks ?? "",
    ];
  })
);

addSheet(
  wb,
  "02_PrimaryKeys",
  ["Table", "Constraint", "Column", "Position"],
  [32, 40, 28, 12],
  pks.map((p) => [p.table_name, p.constraint_name, p.column_name, p.ordinal_position])
);

addSheet(
  wb,
  "03_ForeignKeys",
  ["Table", "Column", "References table", "References column", "On update", "On delete", "Constraint"],
  [32, 28, 32, 22, 14, 16, 40],
  fks.map((f) => [
    f.table_name,
    f.column_name,
    f.foreign_table,
    f.foreign_column,
    f.update_rule,
    f.delete_rule,
    f.constraint_name,
  ])
);

addSheet(
  wb,
  "04_Indexes",
  ["Table", "Index", "Primary", "Unique", "Definition"],
  [32, 48, 10, 10, 90],
  indexes.map((i) => [
    i.table_name,
    i.index_name,
    i.is_primary ? "Yes" : "",
    i.is_unique ? "Yes" : "",
    i.index_def,
  ])
);

const enumNames = [...enumByName.keys()].sort();
addSheet(
  wb,
  "05_Enums",
  ["Enum", "Values"],
  [36, 80],
  enumNames.map((name) => [name, (enumByName.get(name) ?? []).join(", ")])
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(`Wrote ${outPath}`);
console.log(`Tables: ${tables.length}; columns: ${columns.length}; enums: ${enumNames.length}`);
