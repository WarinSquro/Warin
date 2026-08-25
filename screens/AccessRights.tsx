import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  AccessRightsPermissionTree,
  AccessRightsTreeToolbar,
  type AccessRightsPermissionTreeHandle,
} from "../components/AccessRightsPermissionTree";
import type { Employee } from "../data/employees";
import {
  countGrantedKeys,
  getSuperAdminAssignableKeys,
  isSuperAdminEmail,
} from "../data/accessRights";
import { useAuth } from "../context/AuthContext";
import { useEmployees } from "../context/EmployeesContext";
import { useToast } from "../context/ToastContext";
import { fetchAccessRights, fetchAllAccessRights, putAccessRights } from "../api/domain";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { formatDataReachSummary, getResourceOwnerDisplay } from "../utils/employeeHierarchy";
import { matchesSearchQuery } from "../utils/textSearch";
import { ThemeCheckbox } from "../components/ThemeCheckbox";
import { FilterSingleSelect } from "../components/FilterSingleSelect";

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

function keysForEmployeeLocal(emp: Employee, keys: string[]): Set<string> {
  if (isSuperAdminEmail(emp.email)) return new Set(getSuperAdminAssignableKeys());
  return new Set(keys);
}

export function AccessRights() {
  const { refreshAllowedKeys } = useAuth();
  const { employees } = useEmployees();
  const toast = useToast();
  const treeRef = useRef<AccessRightsPermissionTreeHandle>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [rightsCache, setRightsCache] = useState<Record<string, string[]>>({});
  const [copyFromId, setCopyFromId] = useState("");

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId]
  );

  const isSelectedSuperAdmin =
    selectedEmployee != null && isSuperAdminEmail(selectedEmployee.email);
  const isInactiveSelected = selectedEmployee?.status === "inactive";
  const readOnly = isSelectedSuperAdmin || isInactiveSelected;
  const dirty = !setsEqual(draftKeys, savedKeys);

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((e) => !e.isSuperAdmin)
      .filter((e) => includeInactive || e.status === "active")
      .filter((e) => matchesSearchQuery(search, e.name, e.email, e.department, e.id))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [employees, includeInactive, search]);

  const loadEmployee = useCallback(
    async (emp: Employee) => {
      setSelectedId(emp.id);
      setCopyFromId("");
      if (isSuperAdminEmail(emp.email)) {
        const keys = new Set(getSuperAdminAssignableKeys());
        setDraftKeys(keys);
        setSavedKeys(new Set(keys));
        return;
      }
      try {
        const cached = rightsCache[emp.id];
        const keys = cached ?? (await fetchAccessRights(emp.id));
        if (!cached) setRightsCache((c) => ({ ...c, [emp.id]: keys }));
        const set = keysForEmployeeLocal(emp, keys);
        setDraftKeys(set);
        setSavedKeys(new Set(set));
      } catch {
        setDraftKeys(new Set());
        setSavedKeys(new Set());
      }
    },
    [rightsCache]
  );

  useEffect(() => {
    if (!selectedId && filteredEmployees[0]) {
      void loadEmployee(filteredEmployees[0]);
    }
  }, [filteredEmployees, selectedId, loadEmployee]);

  // Load all employees' permission keys once so sidebar counts are correct on
  // first paint (avoids N+1 and React Strict Mode cancel/skip races).
  const reloadRightsCache = useCallback(async () => {
    if (employees.length === 0) return;
    try {
      const rights = await fetchAllAccessRights();
      // Prefer any already-cached / freshly saved entries over the bulk snapshot.
      setRightsCache((c) => ({ ...rights, ...c }));
    } catch {
      /* per-card loadEmployee still works */
    }
  }, [employees]);

  useEffect(() => {
    void reloadRightsCache();
  }, [reloadRightsCache]);

  useSharedDataSync(!dirty, reloadRightsCache, {
    resources: ["access-rights"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  usePauseSharedDataSync(dirty);

  const selectEmployee = (emp: Employee) => {
    if (emp.id === selectedId) return;
    if (dirty) {
      setPendingSelectId(emp.id);
      setShowDiscardDialog(true);
      return;
    }
    void loadEmployee(emp);
  };

  const handleSave = async () => {
    if (!selectedEmployee || readOnly || !dirty) return;
    setSaving(true);
    try {
      const keys = [...draftKeys];
      await putAccessRights(selectedEmployee.id, keys);
      setRightsCache((c) => ({ ...c, [selectedEmployee.id]: keys }));
      setSavedKeys(new Set(draftKeys));
      refreshAllowedKeys();
      toast.updated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraftKeys(new Set(savedKeys));
    setCopyFromId("");
  };

  const handleCopyFrom = async (sourceId: string) => {
    if (readOnly || !sourceId) return;
    const source = employees.find((e) => e.id === sourceId);
    if (!source || isSuperAdminEmail(source.email)) return;
    setCopyFromId(sourceId);
    try {
      const keys = rightsCache[sourceId] ?? (await fetchAccessRights(sourceId));
      setDraftKeys(new Set(keys));
    } catch {
      /* ignore */
    }
  };

  const copySources = employees.filter(
    (e) => e.status === "active" && e.id !== selectedId && !isSuperAdminEmail(e.email)
  );

  const treeKeys = isSelectedSuperAdmin ? new Set(getSuperAdminAssignableKeys()) : draftKeys;

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Access Rights
          </div>
          <div className="text-[12px] text-muted-foreground">
            Page access by employee · data visibility follows hierarchy
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && !readOnly && (
            <span className="text-[12px] text-warning">Unsaved changes</span>
          )}
          {!readOnly && (
            <>
              <button
                type="button"
                disabled={!dirty}
                onClick={handleDiscard}
                className="rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={handleSave}
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium ${
                  dirty && !saving
                    ? "bg-primary text-primary-foreground"
                    : "cursor-not-allowed bg-surface-alt text-muted-foreground"
                }`}
              >
                {saving ? "Saving…" : "Save Access Rights"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
        <aside className="flex w-[300px] flex-shrink-0 flex-col border-r border-border bg-surface">
          <div className="flex-shrink-0 space-y-2 border-b border-border-soft p-3">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee…"
                className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
              <ThemeCheckbox
                checked={includeInactive}
                onChange={() => setIncludeInactive((v) => !v)}
                aria-label="Include inactive"
              />
              Include inactive
            </label>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredEmployees.length === 0 ? (
              <li className="px-2 py-8 text-center text-[12px] text-muted-foreground">
                No people match.
              </li>
            ) : (
              filteredEmployees.map((emp) => {
              const empKeys = isSuperAdminEmail(emp.email)
                ? getSuperAdminAssignableKeys()
                : rightsCache[emp.id] ?? [];
              const { granted, total } = countGrantedKeys(
                empKeys,
                isSuperAdminEmail(emp.email)
              );
              const active = emp.id === selectedId;
              const inactive = emp.status === "inactive";
              return (
                <li key={emp.id}>
                  <button
                    type="button"
                    onClick={() => selectEmployee(emp)}
                    className={`mb-1 w-full rounded-md border px-2.5 py-2 text-left transition ${
                      active
                        ? "border-primary/40 bg-accent-soft/50"
                        : "border-transparent hover:bg-surface-alt"
                    } ${inactive ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-foreground">
                          {emp.name}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">{emp.email}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {emp.department} · RO{" "}
                          {getResourceOwnerDisplay(emp.resourceOwnerId, employees)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase ${
                            emp.status === "active"
                              ? "bg-success-soft text-success"
                              : "bg-surface-alt text-muted"
                          }`}
                        >
                          {emp.status}
                        </span>
                        <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                          {isSuperAdminEmail(emp.email) ? "Full" : `${granted}/${total}`}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
            )}
          </ul>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
          {!selectedEmployee ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
              Select an employee to manage page access
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft/50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Data visibility (automatic)
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-accent-softfg">
                  Not configured here — derived from Resource Owner hierarchy.{" "}
                  {formatDataReachSummary(selectedEmployee.id, employees)}
                </p>
              </div>

              {isSelectedSuperAdmin && (
                <div className="mb-4 rounded-lg border border-border bg-surface-alt px-4 py-3 text-[12px] text-muted-foreground">
                  Super Admin account — all pages are granted and cannot be changed. This
                  prevents locking all administrators out of the system.
                </div>
              )}

              {isInactiveSelected && !isSelectedSuperAdmin && (
                <div className="mb-4 rounded-lg border border-border bg-surface-alt px-4 py-3 text-[12px] text-muted-foreground">
                  Inactive employee — view only. Access rights cannot be edited.
                </div>
              )}

              <div className="mb-4 flex items-center justify-between gap-3">
                {!readOnly && copySources.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <label className="text-[12px] text-muted-foreground">Copy access from</label>
                    <FilterSingleSelect
                      value={copyFromId}
                      onChange={(v) => {
                        if (v) void handleCopyFrom(v);
                      }}
                      options={[
                        { value: "", label: "Select employee…" },
                        ...copySources.map((e) => ({ value: e.id, label: e.name })),
                      ]}
                      aria-label="Copy access from"
                    />
                  </div>
                ) : (
                  <div />
                )}
                <AccessRightsTreeToolbar
                  readOnly={readOnly}
                  onExpandAll={() => treeRef.current?.expandAll()}
                  onCollapseAll={() => treeRef.current?.collapseAll()}
                  onSelectAll={() => treeRef.current?.selectAll()}
                  onClearAll={() => treeRef.current?.clearAll()}
                />
              </div>

              <AccessRightsPermissionTree
                ref={treeRef}
                selectedKeys={treeKeys}
                onChange={setDraftKeys}
                readOnly={readOnly}
                includeSuperAdminOnly={isSelectedSuperAdmin}
              />
            </>
          )}
        </div>
      </div>

      {showDiscardDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-brand/50"
            onClick={() => setShowDiscardDialog(false)}
          />
          <div className="relative z-10 w-full max-w-[400px] rounded-xl bg-surface p-5 shadow-2xl">
            <div className="text-[15px] font-semibold text-foreground">
              You have unsaved access changes. Discard changes and continue?
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDiscardDialog(false);
                  setPendingSelectId(null);
                }}
                className="flex-1 rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt"
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = employees.find((e) => e.id === pendingSelectId);
                  if (next) void loadEmployee(next);
                  setShowDiscardDialog(false);
                  setPendingSelectId(null);
                }}
                className="flex-1 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground"
              >
                Discard and Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
