import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Upload,
  Search,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { resourceOwnerName } from "../data/employees";
import type { Employee } from "../data/employees";
import { initEmptyEmployeeRights } from "../data/accessRights";
import { createEmployee, updateEmployee } from "../api/domain";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import {
  downloadEmployeeUploadTemplate,
  parseEmployeeWorkbook,
  type ParsedEmployeeRow,
} from "../utils/employeeBulkUpload";
import { matchesSearchQuery } from "../utils/textSearch";

type Tab = "active" | "inactive";
type EmployeeSortKey = "name" | "id" | "resourceOwner" | "department" | "skills";

export function EmployeeMaster() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrolledRef = useRef<string | null>(null);

  const { employees, refresh } = useEmployees();

  const rows = employees;
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { sortKey, sortDir, handleSort } = useColumnSort<EmployeeSortKey>("name");

  const filtered = rows.filter(
    (e) =>
      e.status === tab &&
      matchesSearchQuery(
        q,
        e.name,
        e.id,
        e.email,
        e.department,
        e.skills.join(" "),
        resourceOwnerName(e.resourceOwnerId, rows)
      )
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;

    if (sortKey === "name") {
      return mul * a.name.localeCompare(b.name);
    }
    if (sortKey === "id") {
      return mul * a.id.localeCompare(b.id);
    }
    if (sortKey === "resourceOwner") {
      const oa = resourceOwnerName(a.resourceOwnerId, rows);
      const ob = resourceOwnerName(b.resourceOwnerId, rows);
      return mul * oa.localeCompare(ob);
    }
    if (sortKey === "department") {
      return mul * a.department.localeCompare(b.department);
    }
    return mul * a.skills.join(", ").localeCompare(b.skills.join(", "));
  });

  const activeCount = rows.filter((e) => e.status === "active").length;
  const inactiveCount = rows.filter((e) => e.status === "inactive").length;

  useEffect(() => {
    if (!highlightId) return;
    const target = rows.find((e) => e.id === highlightId);
    if (!target) return;
    setTab(target.status);
    setFlashId(highlightId);
    const t = window.setTimeout(() => {
      setFlashId(null);
      setSearchParams({}, { replace: true });
    }, 4000);
    return () => window.clearTimeout(t);
  }, [highlightId, rows, setSearchParams]);

  useEffect(() => {
    if (!flashId || scrolledRef.current === flashId) return;
    const el = document.getElementById(`employee-row-${flashId}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      scrolledRef.current = flashId;
    }
  }, [flashId, sorted]);

  const openNew = () => {
    setSaveError(null);
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (e: Employee) => {
    setSaveError(null);
    setEditing(e);
    setDrawerOpen(true);
  };
  const toggleStatus = async (id: string) => {
    const emp = rows.find((e) => e.id === id);
    if (!emp) return;
    const next = emp.status === "active" ? "inactive" : "active";
    try {
      await updateEmployee(id, { status: next });
      await refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const saveEmployee = async (emp: Employee) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateEmployee(emp.id, {
          name: emp.name,
          email: emp.email,
          department: emp.department,
          skills: emp.skills,
          resourceOwnerHrmsId: emp.resourceOwnerId ?? null,
          status: emp.status,
        });
      } else {
        await createEmployee({
          hrmsId: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.department,
          skills: emp.skills,
          resourceOwnerHrmsId: emp.resourceOwnerId ?? null,
          status: emp.status,
        });
        initEmptyEmployeeRights(emp.id);
      }
      await refresh();
      setDrawerOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Employees</div>
          <div className="text-[12px] text-muted-foreground">{activeCount} active · {inactiveCount} inactive · ID = HRMS ID</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setUploadOpen(true)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt">
            <Upload className="h-3.5 w-3.5" /> Bulk upload
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Add employee
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <Tab active={tab === "active"} onClick={() => setTab("active")}>Active {activeCount}</Tab>
              <Tab active={tab === "inactive"} onClick={() => setTab("inactive")} tone="muted">Inactive {inactiveCount}</Tab>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <Search className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID…" className="w-48 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
            <SortColHeader
              label="NAME"
              col="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[220px]"
            />
            <SortColHeader
              label="HRMS ID"
              col="id"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[110px]"
            />
            <SortColHeader
              label="DEPARTMENT"
              col="department"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[120px]"
            />
            <SortColHeader
              label="SKILLS"
              col="skills"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="flex-1"
            />
            <SortColHeader
              label="RESOURCE OWNER"
              col="resourceOwner"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[140px]"
            />
            <div className="w-[90px] text-right">ACTION</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {sorted.map((e) => (
              <EmpRow
                key={e.id}
                e={e}
                employees={rows}
                highlighted={flashId === e.id}
                onEdit={() => openEdit(e)}
                onToggle={() => toggleStatus(e.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">No employees match.</div>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-danger/30 bg-surface px-4 py-2 text-[12px] text-danger shadow-lg">
          {saveError}
        </div>
      )}

      {drawerOpen && (
        <EmployeeDrawer
          employee={editing}
          saving={saving}
          onClose={() => setDrawerOpen(false)}
          onSave={saveEmployee}
        />
      )}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
    </div>
  );
}

function EmpRow({ e, employees, highlighted, onEdit, onToggle }: { e: Employee; employees: Employee[]; highlighted?: boolean; onEdit: () => void; onToggle: () => void }) {
  const inactive = e.status === "inactive";
  return (
    <div
      id={`employee-row-${e.id}`}
      className={`flex items-center border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
        inactive ? "opacity-60" : ""
      } ${highlighted ? "bg-accent-soft ring-1 ring-inset ring-accent-line" : ""}`}
    >
      <div className="flex w-[220px] items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${inactive ? "bg-surface-alt text-muted" : "bg-accent-soft text-accent-softfg"}`}>
          {e.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
        </div>
        <div>
          <button onClick={onEdit} className="text-[13px] font-medium text-foreground hover:text-primary">{e.name}</button>
          <div className="text-[11px] text-muted-foreground">{e.email}</div>
        </div>
      </div>
      <div className="w-[110px] font-mono text-[12px] text-foreground">{e.id}</div>
      <div className="w-[120px] text-[12px] text-foreground">{e.department}</div>
      <div className="flex flex-1 flex-wrap gap-1">
        {e.skills.slice(0, 3).map((s) => (
          <span key={s} className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted">{s}</span>
        ))}
        {e.skills.length > 3 && <span className="text-[10px] text-muted-foreground">+{e.skills.length - 3}</span>}
      </div>
      <div className="w-[140px] text-[12px] text-foreground">{resourceOwnerName(e.resourceOwnerId, employees)}</div>
      <div className="w-[90px] text-right">
        <button onClick={onToggle} className={`text-[11px] ${inactive ? "text-success hover:underline" : "text-muted-foreground hover:text-danger hover:underline"}`}>
          {inactive ? "Reactivate" : "Disable"}
        </button>
      </div>
    </div>
  );
}

function EmployeeDrawer({
  employee,
  saving,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (emp: Employee) => void;
}) {
  const { employees } = useEmployees();
  const { departments: deptRows, skills: skillRows } = useMasters();
  const departmentNames = deptRows.filter((d) => d.status === "active").map((d) => d.name);

  const [name, setName] = useState(employee?.name ?? "");
  const [id, setId] = useState(employee?.id ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [dept, setDept] = useState(employee?.department ?? departmentNames[0] ?? "");
  const activeSkillNames = useMemo(
    () =>
      skillRows
        .filter((s) => s.status === "active")
        .map((s) => s.name)
        .sort((a, b) => a.localeCompare(b)),
    [skillRows]
  );
  const skillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const skill of skillRows) {
      if (skill.status === "active") counts[skill.name] = skill.peopleCount;
    }
    return counts;
  }, [skillRows]);
  const [skills, setSkills] = useState<string[]>(() =>
    (employee?.skills ?? []).filter((s) => activeSkillNames.includes(s))
  );
  const [resourceOwnerId, setResourceOwnerId] = useState(employee?.resourceOwnerId ?? "");
  const isEdit = !!employee;
  const focusRef = useFocusFirstField<HTMLDivElement>();

  const resourceOwners = employees
    .filter((e) => e.id !== employee?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-brand/30" />
      <div ref={focusRef} className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">{isEdit ? "Edit employee" : "Add employee"}</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Full name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line" placeholder="e.g. Ravi Sharma" />
          </Field>
          <Field label="HRMS ID" required>
            <input value={id} disabled={isEdit} onChange={(e) => setId(e.target.value)} className={`w-full rounded-md border border-border px-3 py-2 font-mono text-[13px] outline-none focus:border-accent-line ${isEdit ? "cursor-not-allowed bg-surface-alt text-muted" : "bg-surface text-foreground"}`} placeholder="EMP-0000" />
          </Field>
          <Field label="Email" required>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line" placeholder="name@acme.io" />
          </Field>
          <Field label="Department" required>
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line">
              {departmentNames.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Skills" hint="From skills master · feeds Find Matches & Availability">
            <FilterMultiSelect
              items={activeSkillNames}
              selected={skills}
              onChange={setSkills}
              counts={skillCounts}
              allLabel="Select skills"
              pluralLabel="skills"
              emptyNeutral
              fullWidth
            />
          </Field>
          <Field label="Resource Owner">
            <select
              value={resourceOwnerId}
              onChange={(e) => setResourceOwnerId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
            >
              <option value="">Select resource owner</option>
              {resourceOwners.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40">Cancel</button>
          <button
            disabled={saving}
            onClick={() => {
              if (!name.trim() || !id.trim() || !email.trim() || saving) return;
              onSave({
                id: id.trim(),
                name: name.trim(),
                email: email.trim(),
                department: dept,
                skills,
                resourceOwnerId: resourceOwnerId || undefined,
                status: employee?.status ?? "active",
              });
            }}
            className="flex-1 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-40"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create employee"}
          </button>
        </div>
      </div>
    </div>
  );
}

type UploadStage = "select" | "preview" | "importing" | "done";
type ImportOutcome = { row: ParsedEmployeeRow; status: "success" | "failed"; message?: string };

function UploadModal({ onClose }: { onClose: () => void }) {
  const { employees, refresh } = useEmployees();
  const { departments } = useMasters();
  const activeDepartmentNames = useMemo(
    () => departments.filter((d) => d.status === "active").map((d) => d.name),
    [departments]
  );
  const existingIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const [stage, setStage] = useState<UploadStage>("select");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedEmployeeRow[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusRef = useFocusFirstField<HTMLDivElement>(stage === "select");

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);
  const newCount = validRows.filter((r) => !existingIds.has(r.hrmsId)).length;
  const updCount = validRows.length - newCount;

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setFileError(null);
    const parsed = await parseEmployeeWorkbook(file, activeDepartmentNames);
    if (parsed.fileError) {
      setFileError(parsed.fileError);
      return;
    }
    setRows(parsed.rows);
    setOutcomes([]);
    setStage("preview");
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0] ?? null);
  };

  const runImport = async () => {
    setStage("importing");
    const results: ImportOutcome[] = [];
    for (const row of validRows) {
      try {
        if (existingIds.has(row.hrmsId)) {
          await updateEmployee(row.hrmsId, {
            name: row.name,
            email: row.email,
            department: row.department,
            skills: row.skills,
          });
        } else {
          await createEmployee({
            hrmsId: row.hrmsId,
            name: row.name,
            email: row.email,
            department: row.department,
            skills: row.skills,
            status: "active",
          });
          initEmptyEmployeeRights(row.hrmsId);
        }
        results.push({ row, status: "success" });
      } catch (e) {
        results.push({ row, status: "failed", message: e instanceof Error ? e.message : "Import failed" });
      }
      setOutcomes([...results]);
    }
    try {
      await refresh();
    } catch {
      /* refresh failure surfaces on the main grid; import itself already completed */
    }
    setStage("done");
  };

  const successCount = outcomes.filter((o) => o.status === "success").length;
  const failedCount = outcomes.filter((o) => o.status === "failed").length + errorRows.length;
  const totalCount = rows.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div onClick={stage === "importing" ? undefined : onClose} className="absolute inset-0 bg-brand/40" />
      <div ref={focusRef} className="relative z-10 flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">Bulk upload employees</div>
          <button
            onClick={stage === "importing" ? undefined : onClose}
            disabled={stage === "importing"}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "select" && (
          <div className="flex flex-col gap-4 px-5 py-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragOver ? "border-primary bg-accent-soft" : "border-accent-line bg-accent-soft/40 hover:bg-accent-soft"
              }`}
            >
              <FileSpreadsheet className="h-9 w-9 text-primary" />
              <div className="text-[13px] font-medium text-foreground">Drop your XLS / XLSX / CSV file or click to browse</div>
              <div className="text-[11px] text-muted-foreground">Columns: Name, Employee ID (HRMS), Email, Department, Skills</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {fileName && !fileError && (
              <div className="text-[11px] text-muted-foreground">Selected: {fileName}</div>
            )}
            {fileError && (
              <div className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
                <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                {fileError}
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border border-border-soft bg-surface-alt px-3.5 py-2.5">
              <div className="text-[12px] text-foreground">Need the format?</div>
              <button
                type="button"
                onClick={() => downloadEmployeeUploadTemplate()}
                className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download template
              </button>
            </div>
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              Employee ID is the unique key. Duplicate IDs within the file, missing mandatory fields, or unknown departments are reported as errors and skipped — the rest still import.
            </div>
          </div>
        )}

        {stage === "preview" && (
          <>
            <div className="flex flex-shrink-0 flex-wrap gap-2 border-b border-border-soft px-5 py-3">
              <Stat icon={CheckCircle2} tone="success" label={`${newCount} new`} />
              <Stat icon={RefreshCw} tone="primary" label={`${updCount} update`} />
              <Stat icon={AlertCircle} tone="danger" label={`${errorRows.length} skipped`} />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="overflow-hidden rounded-md border border-border-soft">
                {rows.map((r) => (
                  <UploadRowView key={r.rowNum} r={r} isUpdate={existingIds.has(r.hrmsId)} />
                ))}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center justify-between border-t border-border-soft px-5 py-3.5">
              <div className="text-[11px] text-muted-foreground">
                {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} will be skipped
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStage("select")}
                  className="rounded-md border border-border px-3.5 py-2 text-[12px] text-foreground hover:bg-surface-alt"
                >
                  Back
                </button>
                <button
                  disabled={validRows.length === 0}
                  onClick={() => void runImport()}
                  className="rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Import {validRows.length} row{validRows.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </>
        )}

        {stage === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-[13px] font-medium text-foreground">
              Importing {outcomes.length} of {validRows.length}…
            </div>
            <div className="h-1.5 w-64 overflow-hidden rounded-full bg-surface-alt">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${validRows.length ? (outcomes.length / validRows.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {stage === "done" && (
          <>
            <div className="flex flex-shrink-0 flex-wrap gap-2 border-b border-border-soft px-5 py-3">
              <Stat icon={FileSpreadsheet} tone="primary" label={`${totalCount} total`} />
              <Stat icon={CheckCircle2} tone="success" label={`${successCount} successful`} />
              <Stat icon={AlertCircle} tone="danger" label={`${failedCount} failed`} />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {failedCount === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                  <div className="text-[13px] font-medium text-foreground">All rows imported successfully.</div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-border-soft">
                  {errorRows.map((r) => (
                    <UploadRowView key={`err-${r.rowNum}`} r={r} isUpdate={false} />
                  ))}
                  {outcomes
                    .filter((o) => o.status === "failed")
                    .map((o) => (
                      <UploadRowView
                        key={`fail-${o.row.rowNum}`}
                        r={{ ...o.row, errors: [o.message ?? "Import failed"] }}
                        isUpdate={existingIds.has(o.row.hrmsId)}
                      />
                    ))}
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center justify-end border-t border-border-soft px-5 py-3.5">
              <button
                onClick={onClose}
                className="rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UploadRowView({ r, isUpdate }: { r: ParsedEmployeeRow; isUpdate: boolean }) {
  const hasError = r.errors.length > 0;
  const map = hasError
    ? { dot: "bg-danger", label: "Skipped", text: "text-danger" }
    : isUpdate
      ? { dot: "bg-primary", label: "Update", text: "text-primary" }
      : { dot: "bg-success", label: "New", text: "text-success" };
  return (
    <div className={`flex items-center gap-3 border-b border-border-soft px-3 py-2.5 last:border-b-0 ${hasError ? "bg-danger-soft/40" : ""}`}>
      <span className="w-6 text-[11px] text-muted-foreground">{r.rowNum}</span>
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${map.dot}`} />
      <div className="w-[130px]">
        <div className="text-[12px] font-medium text-foreground">{r.name || "—"}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{r.hrmsId || "no ID"}</div>
      </div>
      <div className="w-[90px] text-[11px] text-muted-foreground">{r.department || "—"}</div>
      <div className="flex-1 text-[11px] text-muted-foreground">{r.errors.join("; ")}</div>
      <span className={`text-[10px] font-semibold uppercase ${map.text}`}>{map.label}</span>
    </div>
  );
}

function Stat({ icon, tone, label }: { icon: typeof CheckCircle2; tone: "success" | "primary" | "danger"; label: string }) {
  const Icon = icon;
  const c = { success: "text-success", primary: "text-primary", danger: "text-danger" }[tone];
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-surface-alt px-3 py-1.5">
      <Icon className={`h-3.5 w-3.5 ${c}`} />
      <span className={`text-[12px] font-medium ${c}`}>{label}</span>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <label className="text-[12px] font-medium text-foreground">{label}</label>
        {required && <span className="text-[12px] text-danger">*</span>}
        {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Tab({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "muted" }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${active ? "bg-brand text-white" : (tone === "muted" ? "text-muted" : "text-muted") + " hover:bg-surface-alt"}`}>
      {children}
    </button>
  );
}
