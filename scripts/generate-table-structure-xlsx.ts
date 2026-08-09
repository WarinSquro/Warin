/**
 * Generates docs/OneView_Table_Structure.xlsx from the Phase-1 Prisma schema.
 * Run: npx tsx scripts/generate-table-structure-xlsx.ts
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "docs", "OneView_Table_Structure.xlsx");

type Row = {
  tableNo: number;
  tableName: string;
  fieldNo: number;
  fieldName: string;
  dataType: string;
  size: string;
  defaultValue: string;
  remarks: string;
  rule: string;
};

const rows: Row[] = [
  // T01 employees
  { tableNo: 1, tableName: "employees", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "HRMS employee ID (business key)", rule: "PK; Required; Unique; Format e.g. EMP-1042; Never change after create" },
  { tableNo: 1, tableName: "employees", fieldNo: 2, fieldName: "name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "—", remarks: "Display name (single field, no designation)", rule: "Required; Trim whitespace" },
  { tableNo: 1, tableName: "employees", fieldNo: 3, fieldName: "email", dataType: "TEXT / VARCHAR", size: "255", defaultValue: "—", remarks: "Work email used for login", rule: "Required; Unique; Lowercase; Valid email format" },
  { tableNo: 1, tableName: "employees", fieldNo: 4, fieldName: "pin_hash", dataType: "TEXT / VARCHAR", size: "255", defaultValue: "—", remarks: "argon2 hash of 5-digit PIN — never store plaintext", rule: "Required; Never return in API; Auth verify only via hash compare" },
  { tableNo: 1, tableName: "employees", fieldNo: 12, fieldName: "must_change_pin", dataType: "BOOLEAN", size: "—", defaultValue: "false", remarks: "True until first-login PIN change after welcome email", rule: "Set true when temp PIN emailed; cleared on change-pin / reset-pin" },
  { tableNo: 1, tableName: "employees", fieldNo: 13, fieldName: "first_login_completed_at", dataType: "TIMESTAMP", size: "—", defaultValue: "NULL", remarks: "When temporary PIN was replaced", rule: "Optional; Set on successful first PIN change" },
  { tableNo: 1, tableName: "employees", fieldNo: 5, fieldName: "department_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "NULL", remarks: "FK → departments.id", rule: "Optional; FK; Indexed; Must exist if set" },
  { tableNo: 1, tableName: "employees", fieldNo: 6, fieldName: "resource_owner_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "NULL", remarks: "Self-FK → employees.id (manager / RO)", rule: "Optional; FK self; Indexed; Must not create cycles in app logic" },
  { tableNo: 1, tableName: "employees", fieldNo: 7, fieldName: "status", dataType: "ENUM", size: "active | inactive", defaultValue: "active", remarks: "Disable never delete (preserve history)", rule: "Required; Enum EmpStatus; Soft-disable only" },
  { tableNo: 1, tableName: "employees", fieldNo: 8, fieldName: "is_super_admin", dataType: "BOOLEAN", size: "—", defaultValue: "false", remarks: "Full access bypass for Access Rights", rule: "Required; Only provisioned admins (e.g. admin@acme.io)" },
  { tableNo: 1, tableName: "employees", fieldNo: 9, fieldName: "utilization", dataType: "INTEGER", size: "—", defaultValue: "NULL", remarks: "Cached / display utilization % (optional)", rule: "Optional; Non-negative if set" },
  { tableNo: 1, tableName: "employees", fieldNo: 10, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set; Not editable by UI" },
  { tableNo: 1, tableName: "employees", fieldNo: 11, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set on every update" },

  // T02 departments
  { tableNo: 2, tableName: "departments", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Department master key", rule: "PK; Required" },
  { tableNo: 2, tableName: "departments", fieldNo: 2, fieldName: "name", dataType: "TEXT / VARCHAR", size: "150", defaultValue: "—", remarks: "Department display name", rule: "Required; Unique" },
  { tableNo: 2, tableName: "departments", fieldNo: 3, fieldName: "head_name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "NULL", remarks: "Department head display name (denormalized for UI)", rule: "Optional" },
  { tableNo: 2, tableName: "departments", fieldNo: 4, fieldName: "status", dataType: "ENUM", size: "active | inactive", defaultValue: "active", remarks: "Disable never delete", rule: "Required; Enum SetupStatus" },
  { tableNo: 2, tableName: "departments", fieldNo: 5, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },
  { tableNo: 2, tableName: "departments", fieldNo: 6, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T03 skills
  { tableNo: 3, tableName: "skills", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Skill master key", rule: "PK; Required" },
  { tableNo: 3, tableName: "skills", fieldNo: 2, fieldName: "name", dataType: "TEXT / VARCHAR", size: "150", defaultValue: "—", remarks: "Skill name", rule: "Required; Unique" },
  { tableNo: 3, tableName: "skills", fieldNo: 3, fieldName: "category", dataType: "TEXT / VARCHAR", size: "100", defaultValue: "—", remarks: "e.g. Frontend, Backend, QA", rule: "Required" },
  { tableNo: 3, tableName: "skills", fieldNo: 4, fieldName: "status", dataType: "ENUM", size: "active | inactive", defaultValue: "active", remarks: "Disable never delete", rule: "Required; Enum SetupStatus" },
  { tableNo: 3, tableName: "skills", fieldNo: 5, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },
  { tableNo: 3, tableName: "skills", fieldNo: 6, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T04 employee_skills
  { tableNo: 4, tableName: "employee_skills", fieldNo: 1, fieldName: "employee_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "FK → employees.id", rule: "PK (composite); FK; Cascade delete with employee" },
  { tableNo: 4, tableName: "employee_skills", fieldNo: 2, fieldName: "skill_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "FK → skills.id", rule: "PK (composite); FK; Cascade delete with skill" },

  // T05 employee_permissions
  { tableNo: 5, tableName: "employee_permissions", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "30", defaultValue: "cuid()", remarks: "Surrogate key", rule: "PK; System-generated" },
  { tableNo: 5, tableName: "employee_permissions", fieldNo: 2, fieldName: "employee_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "FK → employees.id", rule: "Required; FK; Indexed; Cascade delete" },
  { tableNo: 5, tableName: "employee_permissions", fieldNo: 3, fieldName: "key", dataType: "TEXT / VARCHAR", size: "100", defaultValue: "—", remarks: "Permission key matching navConfig (e.g. planner, reports.deployment)", rule: "Required; Must match PERMISSION_PAGES keys; Unique with employee_id" },
  { tableNo: 5, tableName: "employee_permissions", fieldNo: 4, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Grant time", rule: "System-set" },

  // T06 activity_milestones
  { tableNo: 6, tableName: "activity_milestones", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Catalog milestone for activities", rule: "PK; Required" },
  { tableNo: 6, tableName: "activity_milestones", fieldNo: 2, fieldName: "name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "—", remarks: "Milestone catalog name", rule: "Required; Unique with project_type" },
  { tableNo: 6, tableName: "activity_milestones", fieldNo: 3, fieldName: "project_type", dataType: "ENUM", size: "paid | poc | product", defaultValue: "—", remarks: "Which project type this catalog applies to", rule: "Required; Enum ProjectType" },
  { tableNo: 6, tableName: "activity_milestones", fieldNo: 4, fieldName: "kind", dataType: "ENUM", size: "commercial_only | signoff_only | commercial_signoff | checkpoint_only", defaultValue: "—", remarks: "Milestone kind for allocation rules", rule: "Required; Enum MilestoneKind" },
  { tableNo: 6, tableName: "activity_milestones", fieldNo: 5, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },
  { tableNo: 6, tableName: "activity_milestones", fieldNo: 6, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T07 activities
  { tableNo: 7, tableName: "activities", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Activity master key", rule: "PK; Required" },
  { tableNo: 7, tableName: "activities", fieldNo: 2, fieldName: "name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "—", remarks: "Activity name", rule: "Required" },
  { tableNo: 7, tableName: "activities", fieldNo: 3, fieldName: "activity_milestone_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "FK → activity_milestones.id", rule: "Required; FK" },
  { tableNo: 7, tableName: "activities", fieldNo: 4, fieldName: "billable", dataType: "BOOLEAN", size: "—", defaultValue: "true", remarks: "false = internal; excluded from util denominator", rule: "Required" },
  { tableNo: 7, tableName: "activities", fieldNo: 5, fieldName: "status", dataType: "ENUM", size: "active | inactive", defaultValue: "active", remarks: "Disable never delete", rule: "Required; Enum SetupStatus" },
  { tableNo: 7, tableName: "activities", fieldNo: 6, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },
  { tableNo: 7, tableName: "activities", fieldNo: 7, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T08 projects
  { tableNo: 8, tableName: "projects", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Project business key e.g. PRJ-014", rule: "PK; Required" },
  { tableNo: 8, tableName: "projects", fieldNo: 2, fieldName: "name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "—", remarks: "Project name", rule: "Required" },
  { tableNo: 8, tableName: "projects", fieldNo: 3, fieldName: "customer", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "—", remarks: "Customer / in-house", rule: "Required" },
  { tableNo: 8, tableName: "projects", fieldNo: 4, fieldName: "po_number", dataType: "TEXT / VARCHAR", size: "100", defaultValue: "'' (empty)", remarks: "PO number; required for paid type in UI rules", rule: "Default empty; UI: required when type=paid" },
  { tableNo: 8, tableName: "projects", fieldNo: 5, fieldName: "type", dataType: "ENUM", size: "paid | poc | product", defaultValue: "—", remarks: "Project type", rule: "Required; Enum ProjectType" },
  { tableNo: 8, tableName: "projects", fieldNo: 6, fieldName: "approved_by_name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "NULL", remarks: "POC approver name", rule: "Optional; UI: required when type=poc" },
  { tableNo: 8, tableName: "projects", fieldNo: 7, fieldName: "approved_by_date", dataType: "DATE", size: "—", defaultValue: "NULL", remarks: "POC approval date", rule: "Optional; DATE only" },
  { tableNo: 8, tableName: "projects", fieldNo: 8, fieldName: "approved_by_snap", dataType: "TEXT / VARCHAR", size: "255", defaultValue: "NULL", remarks: "Approval snapshot filename/path", rule: "Optional" },
  { tableNo: 8, tableName: "projects", fieldNo: 9, fieldName: "kickoff_date", dataType: "DATE", size: "—", defaultValue: "—", remarks: "Kickoff date", rule: "Required; DATE" },
  { tableNo: 8, tableName: "projects", fieldNo: 10, fieldName: "start_date", dataType: "DATE", size: "—", defaultValue: "—", remarks: "Planned start", rule: "Required; DATE; start_date ≤ end_date" },
  { tableNo: 8, tableName: "projects", fieldNo: 11, fieldName: "end_date", dataType: "DATE", size: "—", defaultValue: "—", remarks: "Planned end", rule: "Required; DATE; ≥ start_date" },
  { tableNo: 8, tableName: "projects", fieldNo: 12, fieldName: "demand", dataType: "TEXT", size: "—", defaultValue: "'' (empty)", remarks: "Display string for resource demand", rule: "Default empty; Can be derived from demand lines" },
  { tableNo: 8, tableName: "projects", fieldNo: 13, fieldName: "status", dataType: "ENUM", size: "active | inactive", defaultValue: "active", remarks: "Disable never delete", rule: "Required; Enum ProjectStatus" },
  { tableNo: 8, tableName: "projects", fieldNo: 14, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },
  { tableNo: 8, tableName: "projects", fieldNo: 15, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T09 project_milestones
  { tableNo: 9, tableName: "project_milestones", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Project milestone key", rule: "PK; Required" },
  { tableNo: 9, tableName: "project_milestones", fieldNo: 2, fieldName: "project_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "FK → projects.id", rule: "Required; FK; Indexed; Cascade delete" },
  { tableNo: 9, tableName: "project_milestones", fieldNo: 3, fieldName: "name", dataType: "TEXT / VARCHAR", size: "200", defaultValue: "—", remarks: "Milestone name", rule: "Required" },
  { tableNo: 9, tableName: "project_milestones", fieldNo: 4, fieldName: "date", dataType: "DATE", size: "—", defaultValue: "—", remarks: "Milestone target date", rule: "Required; DATE" },
  { tableNo: 9, tableName: "project_milestones", fieldNo: 5, fieldName: "kind", dataType: "ENUM", size: "MilestoneKind (nullable)", defaultValue: "NULL", remarks: "Optional kind override", rule: "Optional; Enum MilestoneKind" },
  { tableNo: 9, tableName: "project_milestones", fieldNo: 6, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },
  { tableNo: 9, tableName: "project_milestones", fieldNo: 7, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T10 project_demand_lines
  { tableNo: 10, tableName: "project_demand_lines", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Demand line key", rule: "PK; Required" },
  { tableNo: 10, tableName: "project_demand_lines", fieldNo: 2, fieldName: "project_id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "FK → projects.id", rule: "Required; FK; Indexed; Cascade delete" },
  { tableNo: 10, tableName: "project_demand_lines", fieldNo: 3, fieldName: "skills", dataType: "TEXT[] / ARRAY", size: "—", defaultValue: "—", remarks: "Array of skill name strings for matching/display", rule: "Required array; Elements non-empty" },
  { tableNo: 10, tableName: "project_demand_lines", fieldNo: 4, fieldName: "count", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "Headcount demanded for this skill set", rule: "Required; Integer ≥ 1" },
  { tableNo: 10, tableName: "project_demand_lines", fieldNo: 5, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },

  // T11 app_settings
  { tableNo: 11, tableName: "app_settings", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "'default'", remarks: "Singleton row id", rule: "PK; Prefer single row id=default" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 2, fieldName: "idle_below", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "Utilization % below = idle", rule: "Required; 0–100; < optimal_to" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 3, fieldName: "optimal_to", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "Utilization % up to = optimal; above = overloaded", rule: "Required; 0–100; > idle_below" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 4, fieldName: "excellent", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "Metric band: Excellent ≥ this %", rule: "Required; Band ordering excellent ≥ good ≥ needs_attention" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 5, fieldName: "good", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "Metric band: Good ≥ this %", rule: "Required" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 6, fieldName: "needs_attention", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "Metric band: Needs Attention ≥ this %; below = Critical", rule: "Required" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 7, fieldName: "capacity_basis", dataType: "ENUM", size: "billable | total", defaultValue: "—", remarks: "Capacity calculation basis", rule: "Required; Enum CapacityBasis" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 8, fieldName: "overallocation_limit", dataType: "INTEGER", size: "—", defaultValue: "—", remarks: "% over 100 allowed before hard warning", rule: "Required; Typically ≥ 100" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 9, fieldName: "working_hours_per_day", dataType: "DOUBLE / FLOAT", size: "—", defaultValue: "—", remarks: "Hours per working day", rule: "Required; > 0" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 10, fieldName: "working_days", dataType: "TEXT[] / ARRAY", size: "—", defaultValue: "—", remarks: "e.g. Mon–Fri", rule: "Required; Non-empty array" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 11, fieldName: "demand_priority", dataType: "TEXT[] / ARRAY", size: "—", defaultValue: "—", remarks: "Ordered priority labels", rule: "Required; Ordered list" },
  { tableNo: 11, tableName: "app_settings", fieldNo: 12, fieldName: "updated_at", dataType: "TIMESTAMP", size: "—", defaultValue: "auto", remarks: "Last update time", rule: "System-set" },

  // T12 company_off_days
  { tableNo: 12, tableName: "company_off_days", fieldNo: 1, fieldName: "id", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Holiday / off-day key", rule: "PK; Required" },
  { tableNo: 12, tableName: "company_off_days", fieldNo: 2, fieldName: "date", dataType: "DATE", size: "—", defaultValue: "—", remarks: "Calendar date of off day", rule: "Required; Unique; DATE" },
  { tableNo: 12, tableName: "company_off_days", fieldNo: 3, fieldName: "label", dataType: "TEXT / VARCHAR", size: "50", defaultValue: "—", remarks: "Holiday name", rule: "Required; Max 50 chars" },
  { tableNo: 12, tableName: "company_off_days", fieldNo: 4, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "Row create time", rule: "System-set" },

  // T13 smtp_settings (extra columns for welcome-email gate)
  { tableNo: 13, tableName: "smtp_settings", fieldNo: 1, fieldName: "connection_verified", dataType: "BOOLEAN", size: "—", defaultValue: "false", remarks: "True after successful Test SMTP Connection", rule: "Required for welcome PIN emails; cleared when SMTP settings change" },
  { tableNo: 13, tableName: "smtp_settings", fieldNo: 2, fieldName: "last_connection_test_at", dataType: "TIMESTAMP", size: "—", defaultValue: "NULL", remarks: "When connection was last verified", rule: "Optional" },

  // T14 welcome_pin_email_logs
  { tableNo: 14, tableName: "welcome_pin_email_logs", fieldNo: 1, fieldName: "id", dataType: "BIGINT", size: "—", defaultValue: "auto", remarks: "Log PK", rule: "PK" },
  { tableNo: 14, tableName: "welcome_pin_email_logs", fieldNo: 2, fieldName: "employee_id", dataType: "BIGINT", size: "—", defaultValue: "—", remarks: "FK → employees.id", rule: "Required; FK; Cascade delete" },
  { tableNo: 14, tableName: "welcome_pin_email_logs", fieldNo: 3, fieldName: "to_email", dataType: "TEXT", size: "—", defaultValue: "—", remarks: "Recipient email", rule: "Required; Never store plaintext PIN" },
  { tableNo: 14, tableName: "welcome_pin_email_logs", fieldNo: 4, fieldName: "status", dataType: "TEXT", size: "sent | failed", defaultValue: "—", remarks: "Delivery outcome", rule: "Required" },
  { tableNo: 14, tableName: "welcome_pin_email_logs", fieldNo: 5, fieldName: "error_message", dataType: "TEXT", size: "—", defaultValue: "NULL", remarks: "Failure detail if any", rule: "Optional; No PIN in message" },
  { tableNo: 14, tableName: "welcome_pin_email_logs", fieldNo: 6, fieldName: "created_at", dataType: "TIMESTAMP", size: "—", defaultValue: "now()", remarks: "When email was attempted", rule: "System-set" },
];

const tableIndex = [
  { no: 1, name: "employees", purpose: "People + login (PIN hash) + super-admin flag + must_change_pin" },
  { no: 2, name: "departments", purpose: "Organization master" },
  { no: 3, name: "skills", purpose: "Skill master" },
  { no: 4, name: "employee_skills", purpose: "Employee ↔ Skill many-to-many" },
  { no: 5, name: "employee_permissions", purpose: "Page permission keys per employee" },
  { no: 6, name: "activity_milestones", purpose: "Activity catalog milestones by project type" },
  { no: 7, name: "activities", purpose: "Activity master (billable flag)" },
  { no: 8, name: "projects", purpose: "Project master" },
  { no: 9, name: "project_milestones", purpose: "Milestones under a project" },
  { no: 10, name: "project_demand_lines", purpose: "Structured resource demand rows" },
  { no: 11, name: "app_settings", purpose: "System parameters (singleton)" },
  { no: 12, name: "company_off_days", purpose: "Company holidays / off days" },
  { no: 13, name: "smtp_settings", purpose: "Product SMTP + connection_verified gate for welcome email" },
  { no: 14, name: "welcome_pin_email_logs", purpose: "Audit of welcome temporary-PIN emails (no plaintext PIN)" },
];

const enums = [
  { name: "EmpStatus", values: "active, inactive" },
  { name: "ProjectStatus", values: "active, inactive" },
  { name: "ProjectType", values: "paid, poc, product" },
  { name: "MilestoneKind", values: "commercial_only, signoff_only, commercial_signoff, checkpoint_only" },
  { name: "SetupStatus", values: "active, inactive" },
  { name: "CapacityBasis", values: "billable, total" },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OneView";
  wb.created = new Date();

  // —— Cover / Index ——
  const cover = wb.addWorksheet("00_Index", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  cover.columns = [
    { header: "Table No.", key: "no", width: 12 },
    { header: "Table Name", key: "name", width: 28 },
    { header: "Purpose", key: "purpose", width: 55 },
    { header: "Field Count", key: "count", width: 14 },
  ];
  styleHeader(cover);
  for (const t of tableIndex) {
    const count = rows.filter((r) => r.tableNo === t.no).length;
    const row = cover.addRow({ no: t.no, name: t.name, purpose: t.purpose, count });
    styleDataRow(row, t.no % 2 === 0);
  }
  cover.addRow([]);
  cover.addRow(["Document", "OneView Phase-1 — PostgreSQL Table Structure (for review before Auth API)"]);
  cover.addRow(["Source", "prisma/schema.prisma"]);
  cover.addRow(["Connection", "postgresql://admin:admin@localhost:5432/oneview"]);
  cover.addRow(["Generated", new Date().toISOString()]);
  cover.addRow(["Note", "Review & correct this sheet; then apply / adjust schema before Auth API work."]);

  // —— Field dictionary ——
  const sheet = wb.addWorksheet("01_Table_Fields", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Table No.", key: "tableNo", width: 11 },
    { header: "Table Name", key: "tableName", width: 24 },
    { header: "Field No.", key: "fieldNo", width: 11 },
    { header: "Field Name", key: "fieldName", width: 26 },
    { header: "Data Type", key: "dataType", width: 18 },
    { header: "Size", key: "size", width: 42 },
    { header: "Default Value", key: "defaultValue", width: 16 },
    { header: "Remarks", key: "remarks", width: 48 },
    { header: "Rule", key: "rule", width: 55 },
  ];
  styleHeader(sheet);

  let lastTable = 0;
  for (const r of rows) {
    const row = sheet.addRow(r);
    const zebra = r.tableNo % 2 === 0;
    styleDataRow(row, zebra);
    if (r.tableNo !== lastTable) {
      // subtle group break: bold table name on first field of each table
      row.getCell("tableName").font = { bold: true, name: "Calibri", size: 11 };
      lastTable = r.tableNo;
    }
    // Highlight auth-critical field
    if (r.fieldName === "pin_hash") {
      row.getCell("fieldName").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
      row.getCell("remarks").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 9 },
  };

  // —— Enums ——
  const enumSheet = wb.addWorksheet("02_Enums", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  enumSheet.columns = [
    { header: "Enum Name", key: "name", width: 22 },
    { header: "Allowed Values", key: "values", width: 70 },
    { header: "Used By", key: "used", width: 50 },
  ];
  styleHeader(enumSheet);
  const enumUsage: Record<string, string> = {
    EmpStatus: "employees.status",
    ProjectStatus: "projects.status",
    ProjectType: "projects.type; activity_milestones.project_type",
    MilestoneKind: "activity_milestones.kind; project_milestones.kind",
    SetupStatus: "departments.status; skills.status; activities.status",
    CapacityBasis: "app_settings.capacity_basis",
  };
  for (const e of enums) {
    const row = enumSheet.addRow({ name: e.name, values: e.values, used: enumUsage[e.name] ?? "" });
    styleDataRow(row, false);
  }

  // —— Auth notes ——
  const auth = wb.addWorksheet("03_Auth_Notes");
  auth.columns = [{ header: "Item", key: "item", width: 28 }, { header: "Detail", key: "detail", width: 80 }];
  styleHeader(auth);
  const authRows = [
    ["Login identity", "employees.email (unique, lowercase)"],
    ["PIN storage", "employees.pin_hash only — never plaintext PIN column"],
    ["PIN format (app)", "Exactly 5 digits (UI); hash with bcrypt/argon2 at write time"],
    ["First login", "employees.must_change_pin; cleared on change-pin / reset-pin"],
    ["Welcome email gate", "smtp_settings.is_configured AND connection_verified"],
    ["Welcome email log", "welcome_pin_email_logs — never store plaintext PIN"],
    ["Demo seed PIN", "12345 for all seeded users (dev only); used when SMTP welcome disabled"],
    ["Super admin", "employees.is_super_admin = true (e.g. admin@acme.io)"],
    ["Page access", "employee_permissions.key must match data/navConfig.ts keys"],
    ["Not in schema yet", "Planner allocations, confirmations, reports snapshots, weekly check-in"],
  ];
  for (const [item, detail] of authRows) {
    const row = auth.addRow({ item, detail });
    styleDataRow(row, false);
  }

  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath}`);
  console.log(`Tables: ${tableIndex.length}, Fields: ${rows.length}`);
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF001433" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  });
}

function styleDataRow(row: ExcelJS.Row, zebra: boolean) {
  row.height = 18;
  row.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10 };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thinBorder();
    if (zebra) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F5F7" } };
    }
  });
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const b: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD0D5DD" } };
  return { top: b, left: b, bottom: b, right: b };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
