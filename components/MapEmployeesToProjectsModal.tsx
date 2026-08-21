import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Users, X } from "lucide-react";
import {
  fetchEmployeeProjectMaps,
  mapEmployeesToProject,
  unmapEmployeeFromProject,
  type EmployeeProjectMapRow,
} from "../api/domain";
import { useProjects } from "../context/ProjectsContext";
import { useToast } from "../context/ToastContext";
import { FilterSelect } from "./FilterSelect";
import { SortColHeader, useColumnSort } from "./SortColHeader";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { TruncateText } from "./TruncateText";

type SortKey = "name" | "department" | "projects";

export function MapEmployeesToProjectsModal({ onClose }: { onClose: () => void }) {
  const { projects } = useProjects();
  const toast = useToast();
  const [rows, setRows] = useState<EmployeeProjectMapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qName, setQName] = useState("");
  const [qDept, setQDept] = useState("");
  const [qProject, setQProject] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mapProjectCode, setMapProjectCode] = useState("");
  const [unmapTarget, setUnmapTarget] = useState<{
    hrmsId: string;
    projectCode: string;
    projectName: string;
  } | null>(null);
  const { sortKey, sortDir, handleSort } = useColumnSort<SortKey>("name", "asc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchEmployeeProjectMaps();
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load mappings");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  const projectOptions = useMemo(
    () => activeProjects.map((p) => ({ value: p.id, label: p.name })),
    [activeProjects]
  );

  const filtered = useMemo(() => {
    const nameQ = qName.trim().toLowerCase();
    const deptQ = qDept.trim().toLowerCase();
    const projQ = qProject.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (nameQ && !r.name.toLowerCase().includes(nameQ)) return false;
      if (deptQ && !r.department.toLowerCase().includes(deptQ)) return false;
      if (projQ) {
        const hit = r.projects.some(
          (p) =>
            p.name.toLowerCase().includes(projQ) ||
            p.projectCode.toLowerCase().includes(projQ)
        );
        if (!hit) return false;
      }
      return true;
    });
    const mul = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "department") cmp = a.department.localeCompare(b.department);
      else {
        cmp = a.projects.map((p) => p.name).join(", ").localeCompare(
          b.projects.map((p) => p.name).join(", ")
        );
      }
      return mul * cmp || a.hrmsId.localeCompare(b.hrmsId);
    });
    return list;
  }, [rows, qName, qDept, qProject, sortKey, sortDir]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.hrmsId));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of filtered) next.delete(r.hrmsId);
      } else {
        for (const r of filtered) next.add(r.hrmsId);
      }
      return next;
    });
  };

  const toggleOne = (hrmsId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hrmsId)) next.delete(hrmsId);
      else next.add(hrmsId);
      return next;
    });
  };

  const handleMap = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one employee");
      return;
    }
    if (!mapProjectCode) {
      toast.error("Select a project to map");
      return;
    }
    setBusy(true);
    try {
      await mapEmployeesToProject({
        employeeHrmsIds: [...selected],
        projectCode: mapProjectCode,
      });
      toast.success("Employees mapped to project");
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Map failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmUnmap = async () => {
    if (!unmapTarget) return;
    setBusy(true);
    try {
      await unmapEmployeeFromProject({
        employeeHrmsId: unmapTarget.hrmsId,
        projectCode: unmapTarget.projectCode,
      });
      toast.success("Project unmapped");
      setUnmapTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unmap failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-brand/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-employees-title"
        className="relative z-10 flex h-[min(92vh,880px)] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent-softfg">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div id="map-employees-title" className="text-[15px] font-semibold text-foreground">
                Map Employees to Projects
              </div>
              <div className="text-[12px] text-muted-foreground">
                Eligibility for Work Allocation — which projects a resource can be assigned
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[12px]">
            <colgroup>
              <col className="w-10" />
              <col className="w-[28%]" />
              <col className="w-[22%]" />
              <col />
            </colgroup>
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="border-b border-border-soft align-bottom">
                <th className="w-10 px-4 py-3" aria-hidden />
                <th className="px-3 py-3 font-normal">
                  <label className="mb-1 block text-left text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                    Resource Name
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={qName}
                      onChange={(e) => setQName(e.target.value)}
                      placeholder="Search name…"
                      className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] font-normal normal-case tracking-normal text-foreground outline-none focus:border-accent-line"
                    />
                  </div>
                </th>
                <th className="px-3 py-3 font-normal">
                  <label className="mb-1 block text-left text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                    Department
                  </label>
                  <input
                    value={qDept}
                    onChange={(e) => setQDept(e.target.value)}
                    placeholder="Filter department…"
                    className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] font-normal normal-case tracking-normal text-foreground outline-none focus:border-accent-line"
                  />
                </th>
                <th className="px-3 py-3 font-normal">
                  <label className="mb-1 block text-left text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                    Project
                  </label>
                  <input
                    value={qProject}
                    onChange={(e) => setQProject(e.target.value)}
                    placeholder="Filter mapped project…"
                    className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] font-normal normal-case tracking-normal text-foreground outline-none focus:border-accent-line"
                  />
                </th>
              </tr>
              <tr className="border-b border-border-soft bg-surface-alt text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-2.5">
                  {!loading && filtered.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="cursor-pointer"
                      aria-label="Select all visible"
                    />
                  ) : null}
                </th>
                <th className="px-3 py-2.5">
                  <SortColHeader
                    label="Resource Name"
                    col="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5">
                  <SortColHeader
                    label="Department"
                    col="department"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5">
                  <SortColHeader
                    label="Mapped Projects"
                    col="projects"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                    {rows.length === 0
                      ? "No employees in your mapping scope (Resource Owners map direct and indirect reports only)."
                      : "No employees match the filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.hrmsId} className="border-b border-border-soft hover:bg-surface-alt/60">
                    <td className="px-4 py-2.5 align-middle">
                      <input
                        type="checkbox"
                        checked={selected.has(r.hrmsId)}
                        onChange={() => toggleOne(r.hrmsId)}
                        className="cursor-pointer"
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle font-medium text-foreground">
                      <TruncateText>{r.name}</TruncateText>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">
                      <TruncateText>{r.department || "—"}</TruncateText>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {r.projects.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.projects.map((p) => (
                            <button
                              key={p.projectCode}
                              type="button"
                              title={`Unmap ${p.name}`}
                              disabled={busy}
                              onClick={() =>
                                setUnmapTarget({
                                  hrmsId: r.hrmsId,
                                  projectCode: p.projectCode,
                                  projectName: p.name,
                                })
                              }
                              className="inline-flex max-w-[220px] cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-foreground hover:border-danger/40 hover:bg-danger-soft/40"
                            >
                              <TruncateText className="min-w-0">{p.name}</TruncateText>
                              <X className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-end gap-3 border-t border-border-soft bg-surface px-5 py-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Map to project
            </label>
            <FilterSelect
              value={mapProjectCode}
              onChange={setMapProjectCode}
              options={projectOptions}
              placeholder="Select project…"
              aria-label="Project to map"
            />
          </div>
          <div className="pb-0.5 text-[11px] text-muted-foreground">
            {selected.size === 0
              ? "Select employee(s) in the grid above"
              : `${selected.size} selected`}
          </div>
          <button
            type="button"
            disabled={busy || selected.size === 0 || !mapProjectCode}
            onClick={() => void handleMap()}
            className={`rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground ${
              busy || selected.size === 0 || !mapProjectCode
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:opacity-95"
            }`}
          >
            Map{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={Boolean(unmapTarget)}
        confirming={busy}
        onCancel={() => setUnmapTarget(null)}
        onConfirm={() => void confirmUnmap()}
      />
    </div>
  );
}
