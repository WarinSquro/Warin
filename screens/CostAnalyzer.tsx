import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowLeft, ChevronDown, ChevronRight, X } from "lucide-react";
import {
  fetchCostAnalyzer,
  fetchCostAnalyzerDepartmentDrilldown,
  fetchCostAnalyzerLostDrilldown,
  fetchCostAnalyzerOverCapturedDrilldown,
  fetchCostAnalyzerProjectDrilldown,
  fetchDepartments,
  type CostAnalyzerPayload,
  type CostAnalyzerPeriodId,
  type CostKpiCard,
} from "../api/domain";
import { FilterSingleSelect } from "../components/FilterSingleSelect";
import { DepartmentSelect } from "../components/DepartmentSelect";
import { useToast } from "../context/ToastContext";
import type { Department } from "../data/setup";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { addDaysISO } from "../utils/date";

/** API `departmentIds` query: omit/null = all; `none` = empty; else comma-separated PKs. */
function costAnalyzerDepartmentIdsParam(
  selectedNames: string[],
  departments: Department[]
): string | null {
  if (departments.length === 0) return null;
  if (selectedNames.length === 0) return "none";
  if (selectedNames.length === departments.length) return null;
  const ids = departments
    .filter((d) => selectedNames.includes(d.name))
    .map((d) => d.dbId ?? d.id)
    .filter(Boolean);
  return ids.length > 0 ? ids.join(",") : "none";
}
function last12WeekStarts(): string[] {
  const now = new Date();
  const x = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const current = toIso(x);
  const weeks: string[] = [];
  for (let i = 0; i < 12; i++) weeks.push(addDaysISO(current, -7 * i));
  return weeks;
}
const PERIOD_OPTIONS: { value: CostAnalyzerPeriodId; label: string }[] = [
  { value: "this_week", label: "This Week" },
  { value: "prev_week", label: "Previous Week" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
  { value: "custom", label: "Custom Weeks" },
];

const DONUT_COLORS = ["#1B3A5F", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#64748B"];

/** Compact INR for KPI cards: ₹00.00L / ₹00.00K / ₹00.00 */
function inrCompact(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number) =>
    v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 100_000) return `₹${fmt(n / 100_000)}L`;
  if (abs >= 1_000) return `₹${fmt(n / 1_000)}K`;
  return `₹${fmt(n)}`;
}

function trendArrow(direction: CostKpiCard["direction"]): string {
  if (direction === "up") return "▲";
  if (direction === "down") return "▼";
  return "→";
}

/** Arrow color: up=success / down=danger; set `upIsBad` for Lost / Unplanned. */
function trendArrowClass(
  direction: CostKpiCard["direction"],
  upIsBad?: boolean,
): string {
  if (direction === "same") return "text-muted-foreground";
  const upGood = !upIsBad;
  if (direction === "up") return upGood ? "text-success" : "text-danger";
  if (direction === "down") return upGood ? "text-danger" : "text-success";
  return "text-muted-foreground";
}

function TrendVsPrior({
  card,
  variant = "full",
  upIsBad,
}: {
  card: Pick<CostKpiCard, "changePct" | "direction" | "previousAmount">;
  variant?: "full" | "short";
  upIsBad?: boolean;
}) {
  if (card.changePct == null) {
    return (
      <span className="text-muted-foreground">
        {variant === "full"
          ? `vs prior (${inrCompact(card.previousAmount)})`
          : inrCompact(card.previousAmount)}
      </span>
    );
  }
  const tone = trendArrowClass(card.direction, upIsBad);
  return (
    <span className={`font-medium ${tone}`}>
      {trendArrow(card.direction)} {Math.abs(card.changePct).toFixed(1)}%
      {variant === "full"
        ? ` vs prior (${inrCompact(card.previousAmount)})`
        : ` (${inrCompact(card.previousAmount)})`}
    </span>
  );
}

function attentionCardTone(type: string): { card: string; label: string; heading: string } {
  const t = type.toLowerCase();
  if (t.includes("lost")) {
    return {
      card: "border-danger-border/70 bg-danger-soft/55 hover:bg-danger-soft/75",
      label: "text-danger",
      heading: "High Lost / Not-Captured Cost",
    };
  }
  if (t.includes("unplanned") || t.includes("over-captured")) {
    return {
      card: "border-warning-border/70 bg-warning-soft/55 hover:bg-warning-soft/75",
      label: "text-warning",
      heading: type,
    };
  }
  return {
    card: "border-border-soft bg-[#EEF2F6] hover:bg-[#E4EAF0]",
    label: "text-muted",
    heading: t.includes("top cost") ? "Top Cost-Consuming Project" : type,
  };
}

type ProjectDrawerFromDepartment = {
  id: string;
  name: string;
};

type DrawerState =
  | { kind: "lost"; rows: Array<Record<string, string | number | null>>; from: string; to: string }
  | { kind: "over"; rows: Array<Record<string, string | number | null>>; from: string; to: string }
  | {
      kind: "project";
      from: string;
      to: string;
      project: CostAnalyzerPayload["projects"][number];
      departments: CostAnalyzerPayload["projects"][number]["departments"];
      employees: Array<{
        name: string;
        department: string | null;
        hours: number;
        cost: number;
        pctOfProject: number | null;
      }>;
      /** When set, header shows Back to return to prior list/drawer. */
      backTo?: "projects_list" | "department";
      /** Source department when opened from Department Cost Distribution drill-down. */
      fromDepartment?: ProjectDrawerFromDepartment;
      /** When false (default from department), contribution tables are scoped to fromDepartment. */
      showAllDepartments?: boolean;
    }
  | {
      kind: "department";
      departmentId: string;
      name: string;
      from: string;
      to: string;
      projects: CostAnalyzerPayload["projects"];
      unplannedReasons: CostAnalyzerPayload["unplannedReasons"];
      employees: Array<{
        employee: string;
        department: string | null;
        hours: number;
        cost: number;
        pct: number | null;
        capturePct?: number | null;
      }>;
    }
  | { kind: "projects_list"; rows: CostAnalyzerPayload["projects"]; from: string; to: string }
  | {
      kind: "unplanned_list";
      reasons: CostAnalyzerPayload["unplannedReasons"];
      employees: CostAnalyzerPayload["unplannedEmployees"];
      from: string;
      to: string;
    }
  | null;

export function CostAnalyzer() {
  const toast = useToast();
  const { formatDate } = useAppDateFormat();
  const [period, setPeriod] = useState<CostAnalyzerPeriodId>("this_week");
  const [customWeeks, setCustomWeeks] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsReady, setDepartmentsReady] = useState(false);
  const [data, setData] = useState<CostAnalyzerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectSort, setProjectSort] = useState<"highest" | "lowest" | "outside">("highest");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const departmentNames = useMemo(
    () => [...departments.map((d) => d.name)].sort((a, b) => a.localeCompare(b)),
    [departments]
  );
  const departmentCounts = useMemo(
    () => Object.fromEntries(departmentNames.map((n) => [n, 0])),
    [departmentNames]
  );
  const departmentIdsParam = useMemo(
    () => costAnalyzerDepartmentIdsParam(selectedDepartments, departments),
    [selectedDepartments, departments]
  );

  useEffect(() => {
    void fetchDepartments(false)
      .then((list) => {
        setDepartments(list);
        const names = [...list.map((d) => d.name)].sort((a, b) => a.localeCompare(b));
        setSelectedDepartments(names);
        setDepartmentsReady(true);
      })
      .catch(() => {
        setDepartments([]);
        setSelectedDepartments([]);
        setDepartmentsReady(true);
      });
  }, []);

  const load = useCallback(async () => {
    if (!departmentsReady) return;
    if (departments.length > 0 && selectedDepartments.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchCostAnalyzer({
        period,
        weeks: period === "custom" ? customWeeks : undefined,
        departmentIds: departmentIdsParam,
      });
      setData(payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Cost Analyzer");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    period,
    customWeeks,
    departmentIdsParam,
    departments.length,
    selectedDepartments.length,
    departmentsReady,
    toast,
  ]);

  useEffect(() => {
    if (!departmentsReady) return;
    if (period === "custom" && customWeeks.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }
    void load();
  }, [load, period, customWeeks.length, departmentsReady]);

  const sortedProjects = useMemo(() => {
    if (!data) return [];
    const list = [...data.projects];
    if (projectSort === "lowest") list.sort((a, b) => a.cost - b.cost);
    else if (projectSort === "outside")
      list.sort((a, b) => b.outsidePeriodCost - a.outsidePeriodCost);
    else list.sort((a, b) => b.cost - a.cost);
    return list;
  }, [data, projectSort]);

  const openLost = async () => {
    setDrawerLoading(true);
    try {
      const res = await fetchCostAnalyzerLostDrilldown({
        period,
        weeks: period === "custom" ? customWeeks : undefined,
        departmentIds: departmentIdsParam,
      });
      setDrawer({
        kind: "lost",
        rows: res.rows,
        from: data?.period.from ?? "",
        to: data?.period.to ?? "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load lost cost");
    } finally {
      setDrawerLoading(false);
    }
  };

  const openOver = async () => {
    setDrawerLoading(true);
    try {
      const res = await fetchCostAnalyzerOverCapturedDrilldown({
        period,
        weeks: period === "custom" ? customWeeks : undefined,
        departmentIds: departmentIdsParam,
      });
      setDrawer({
        kind: "over",
        rows: res.rows,
        from: data?.period.from ?? "",
        to: data?.period.to ?? "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load over-captured");
    } finally {
      setDrawerLoading(false);
    }
  };

  const openProject = async (projectId: string) => {
    const fromProjectsList = drawer?.kind === "projects_list";
    const fromDepartment =
      drawer?.kind === "department"
        ? { id: drawer.departmentId, name: drawer.name }
        : undefined;
    setDrawerLoading(true);
    try {
      const res = await fetchCostAnalyzerProjectDrilldown({
        period,
        weeks: period === "custom" ? customWeeks : undefined,
        departmentIds: departmentIdsParam,
        projectId,
      });
      setDrawer({
        kind: "project",
        from: data?.period.from ?? "",
        to: data?.period.to ?? "",
        project: res.project,
        departments: res.departments,
        employees: res.employees,
        ...(fromProjectsList ? { backTo: "projects_list" as const } : {}),
        ...(fromDepartment
          ? {
              backTo: "department" as const,
              fromDepartment,
              showAllDepartments: false,
            }
          : {}),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setDrawerLoading(false);
    }
  };

  const backFromProjectDrawer = () => {
    if (!drawer || drawer.kind !== "project") return;
    if (drawer.backTo === "projects_list") {
      setDrawer({
        kind: "projects_list",
        rows: data?.projects ?? [],
        from: drawer.from,
        to: drawer.to,
      });
      return;
    }
    if (drawer.backTo === "department" && drawer.fromDepartment) {
      const deptId = drawer.fromDepartment.id;
      void openDepartment(deptId === "none" ? null : deptId);
    }
  };

  const showAllDepartmentsInProjectDrawer = () => {
    setDrawer((prev) =>
      prev?.kind === "project" && prev.fromDepartment
        ? { ...prev, showAllDepartments: true }
        : prev
    );
  };

  const openDepartment = async (id: string | null) => {
    const departmentKey = id ?? "none";
    setDrawerLoading(true);
    try {
      const res = await fetchCostAnalyzerDepartmentDrilldown({
        period,
        weeks: period === "custom" ? customWeeks : undefined,
        departmentId: departmentKey,
      });
      setDrawer({
        kind: "department",
        departmentId: departmentKey,
        name: res.departmentName,
        from: data?.period.from ?? "",
        to: data?.period.to ?? "",
        projects: res.projects,
        unplannedReasons: res.unplannedReasons,
        employees: res.employees,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load department");
    } finally {
      setDrawerLoading(false);
    }
  };

  const toggleWeek = (monday: string) => {
    setCustomWeeks((prev) =>
      prev.includes(monday) ? prev.filter((w) => w !== monday) : [...prev, monday].sort()
    );
  };

  const compositionData = data
    ? [
        { name: "Listed Projects", value: data.composition.projectCost },
        { name: "Unplanned Work", value: data.composition.unplannedCost },
      ].filter((d) => d.value > 0)
    : [];

  const deptChartData =
    data?.departmentMode === "departments" && data.departments
      ? data.departments.map((d) => ({ name: d.name, value: d.cost, id: d.departmentId }))
      : data?.selectedDepartmentSplit
        ? [
            { name: "Listed Projects", value: data.selectedDepartmentSplit.projectCost, id: null },
            { name: "Unplanned Work", value: data.selectedDepartmentSplit.unplannedCost, id: null },
          ].filter((d) => d.value > 0)
        : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Cost Analyzer</div>
          <div className="text-[12px] text-muted-foreground">
            Manpower cost visibility · INR · working calendar capacity
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSingleSelect
            value={period}
            onChange={(v) => setPeriod(v as CostAnalyzerPeriodId)}
            options={PERIOD_OPTIONS}
            aria-label="Period"
          />
          <DepartmentSelect
            departments={departmentNames}
            selected={selectedDepartments}
            onChange={setSelectedDepartments}
            counts={departmentCounts}
            align="end"
            showCounts={false}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
        {period === "custom" && (
          <div className="mb-4 rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Custom weeks (continuous selection)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(data?.period.availableWeeks.map((w) => w.monday) ?? last12WeekStarts()).map((monday) => {
                const on = customWeeks.includes(monday);
                return (
                  <button
                    key={monday}
                    type="button"
                    onClick={() => toggleWeek(monday)}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-surface text-muted hover:bg-surface-alt"
                    }`}
                  >
                    {formatDate(monday)}
                  </button>
                );
              })}
            </div>
            {customWeeks.length === 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">Select at least one week.</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-[12px] text-muted-foreground">Loading…</div>
        ) : !data ? (
          <div className="py-20 text-center text-[12px] text-muted-foreground">No data.</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-[11px] text-muted-foreground">
              {formatDate(data.period.from)} – {formatDate(data.period.to)} · vs{" "}
              {formatDate(data.period.previousFrom)} – {formatDate(data.period.previousTo)}
            </div>

            {/* COST SUMMARY */}
            <section>
              <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Cost Summary
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryKpiCard
                  title="Total CTC"
                  card={data.kpi.totalCtc}
                  pills={[
                    { label: "Captured", pct: data.kpi.capturedCost.pctOfCtc ?? null },
                    { label: "Lost", pct: data.kpi.lostCost.pctOfCtc ?? null },
                  ]}
                />
                <SummaryKpiCard
                  title="Captured Cost"
                  card={data.kpi.capturedCost}
                  showPctOfCtc
                  pills={[
                    { label: "Project", pct: data.composition.projectPct },
                    { label: "Unplanned", pct: data.composition.unplannedPct },
                  ]}
                />
                <SummaryKpiCard
                  title="Lost / Not Captured"
                  card={data.kpi.lostCost}
                  showPctOfCtc
                  warnWhenUp
                  onClick={() => void openLost()}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Captured + Lost = Total CTC (when not over-captured)
              </p>
            </section>

            {/* CAPTURED COST BREAK-UP */}
            <section>
              <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Captured Cost Break-Up
              </h2>
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <BreakupKpiCard
                    title="Project Cost"
                    card={data.kpi.projectCost}
                    borderClass="border-[#8B5CF6]/80"
                    onClick={() =>
                      setDrawer({
                        kind: "projects_list",
                        rows: data.projects,
                        from: data.period.from,
                        to: data.period.to,
                      })
                    }
                  />
                  <BreakupKpiCard
                    title="Unplanned Cost"
                    card={data.kpi.unplannedCost}
                    upIsBad
                    borderClass="border-[#F59E0B]/90"
                    onClick={() =>
                      setDrawer({
                        kind: "unplanned_list",
                        reasons: data.unplannedReasons,
                        employees: data.unplannedEmployees ?? [],
                        from: data.period.from,
                        to: data.period.to,
                      })
                    }
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Project + Unplanned = Captured
                </p>
              </div>
              {data.kpi.overCaptured ? (
                <button
                  type="button"
                  onClick={() => void openOver()}
                  className="mt-3 w-full cursor-pointer rounded-lg border border-danger/40 bg-danger-soft/30 p-4 text-left hover:bg-danger-soft/50 sm:w-auto"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-danger">
                    Over-Captured
                  </div>
                  <div className="mt-1 text-[20px] font-semibold tabular-nums text-foreground">
                    {inrCompact(data.kpi.overCaptured.amount)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {data.kpi.overCaptured.employeeCount} employee(s)
                    {data.kpi.overCaptured.changePct != null
                      ? ` · ${Math.abs(data.kpi.overCaptured.changePct).toFixed(1)}% vs prior`
                      : ""}
                  </div>
                </button>
              ) : null}
            </section>

            {data.attention.length > 0 && (
              <section className="rounded-lg border border-border bg-surface p-4">
                <h2 className="mb-2 text-[13px] font-semibold text-foreground">Management Attention</h2>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {data.attention.slice(0, 9).map((a, i) => {
                    const tone = attentionCardTone(a.type);
                    return (
                      <button
                        key={`${a.type}-${a.entityName}-${i}`}
                        type="button"
                        className={`cursor-pointer rounded-md border px-3 py-2 text-left transition-colors ${tone.card}`}
                        onClick={() => {
                          if (a.link.kind === "project") void openProject(a.link.id);
                          else if (a.link.kind === "over_captured") void openOver();
                          else if (a.link.kind === "unplanned")
                            setDrawer({
                              kind: "unplanned_list",
                              reasons: data.unplannedReasons,
                              employees: data.unplannedEmployees ?? [],
                              from: data.period.from,
                              to: data.period.to,
                            });
                          else if (a.link.kind === "employee") void openLost();
                        }}
                      >
                        <div className={`text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
                          {tone.heading}
                        </div>
                        <div className="truncate text-[12px] font-medium text-foreground">{a.entityName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {inrCompact(a.amount)}
                          {a.hours != null ? ` · ${a.hours}h` : ""}
                          {a.pct != null ? ` · ${a.pct}%` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section className="rounded-lg border border-border bg-surface p-4">
                <h2 className="mb-3 text-[13px] font-semibold text-foreground">
                  Captured Cost Composition
                </h2>
                <DonutWithLegend
                  data={compositionData.map((d) => ({
                    name: d.name,
                    value: d.value,
                    pct:
                      d.name === "Listed Projects"
                        ? data.composition.projectPct
                        : data.composition.unplannedPct,
                  }))}
                  onSliceClick={(name) => {
                    if (name === "Listed Projects")
                      setDrawer({
                        kind: "projects_list",
                        rows: data.projects,
                        from: data.period.from,
                        to: data.period.to,
                      });
                    if (name === "Unplanned Work")
                      setDrawer({
                        kind: "unplanned_list",
                        reasons: data.unplannedReasons,
                        employees: data.unplannedEmployees ?? [],
                        from: data.period.from,
                        to: data.period.to,
                      });
                  }}
                  emptyMessage="No captured cost."
                />
              </section>

              <section className="rounded-lg border border-border bg-surface p-4">
                <h2 className="mb-3 text-[13px] font-semibold text-foreground">
                  {data.departmentMode === "departments"
                    ? "Department Cost Distribution"
                    : "Selected Department — Project vs Unplanned"}
                </h2>
                <DonutWithLegend
                  data={deptChartData.map((d) => {
                    const dept = data.departments?.find((x) => x.name === d.name);
                    const split = data.selectedDepartmentSplit;
                    let pct: number | null = dept?.pctShare ?? null;
                    if (pct == null && split) {
                      if (d.name === "Listed Projects") pct = split.projectPct;
                      if (d.name === "Unplanned Work") pct = split.unplannedPct;
                    }
                    return { name: d.name, value: d.value, pct };
                  })}
                  onSliceClick={(name) => {
                    if (data.departmentMode === "departments") {
                      const d = data.departments?.find((x) => x.name === name);
                      if (d) void openDepartment(d.departmentId);
                    }
                  }}
                  emptyMessage="No department cost."
                />
              </section>
            </div>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-foreground">Project Cost Analysis</h2>
                <FilterSingleSelect
                  value={projectSort}
                  onChange={(v) => setProjectSort(v as typeof projectSort)}
                  options={[
                    { value: "highest", label: "Highest Cost" },
                    { value: "lowest", label: "Lowest Cost" },
                    { value: "outside", label: "Highest Outside-Period Cost" },
                  ]}
                  aria-label="Sort projects"
                />
              </div>
              {sortedProjects.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface p-6 text-center text-[12px] text-muted-foreground">
                  No project cost in this period.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sortedProjects.map((p) => (
                    <button
                      key={p.projectId}
                      type="button"
                      onClick={() => void openProject(p.projectId)}
                      className="cursor-pointer rounded-lg border border-border bg-surface p-4 text-left hover:border-brand/40 hover:bg-surface-alt/40"
                    >
                      <div className="truncate text-[13px] font-semibold text-foreground" title={p.name}>
                        {p.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.startDate && p.endDate
                          ? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`
                          : "—"}{" "}
                        · PO {p.poNumber || "—"}
                      </div>
                      <div className="mt-2 text-[18px] font-semibold tabular-nums">{inrCompact(p.cost)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.hours}h
                        {p.companySharePct != null
                          ? ` · ${p.companySharePct}% of Company Captured Cost`
                          : ""}
                      </div>
                      {p.outsidePeriodCost > 0 && (
                        <div className="mt-1 text-[11px] text-warning">
                          Outside period {inrCompact(p.outsidePeriodCost)} · {p.outsidePeriodHours}h
                        </div>
                      )}
                      <div className="mt-2 space-y-0.5">
                        {p.departments.slice(0, 4).map((d) => (
                          <div key={d.name} className="flex justify-between gap-2 text-[11px]">
                            <span className="truncate text-muted-foreground">{d.name}</span>
                            <span className="tabular-nums text-foreground">
                              {inrCompact(d.cost)}
                              {d.pctOfProject != null ? ` · ${d.pctOfProject}%` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {(drawer || drawerLoading) && (
        <SideDrawer
          title={drawerTitle(drawer)}
          subtitle={
            drawer &&
            (drawer.kind === "lost" ||
              drawer.kind === "over" ||
              drawer.kind === "projects_list" ||
              drawer.kind === "unplanned_list" ||
              drawer.kind === "department" ||
              drawer.kind === "project") &&
            "from" in drawer &&
            drawer.from &&
            drawer.to
              ? `${formatDate(drawer.from)} – ${formatDate(drawer.to)}`
              : undefined
          }
          onBack={
            drawer?.kind === "project" &&
            (drawer.backTo === "projects_list" || drawer.backTo === "department")
              ? backFromProjectDrawer
              : undefined
          }
          onClose={() => setDrawer(null)}
        >
          {drawerLoading || !drawer ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground">Loading…</div>
          ) : (
            <DrawerBody
              drawer={drawer}
              formatDate={formatDate}
              onOpenProject={openProject}
              onShowAllDepartments={showAllDepartmentsInProjectDrawer}
            />
          )}
        </SideDrawer>
      )}
    </div>
  );
}

function summaryPillTone(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("lost")) {
    return "border-danger-border bg-danger-soft text-danger";
  }
  if (key.includes("unplanned")) {
    return "border-warning-border bg-warning-soft text-warning";
  }
  if (key.includes("captured")) {
    return "border-success-border bg-success-soft text-success-fg";
  }
  if (key.includes("project")) {
    return "border-accent-line bg-accent-soft text-accent-softfg";
  }
  return "border-border bg-surface-alt text-muted-foreground";
}

function SummaryKpiCard({
  title,
  card,
  showPctOfCtc,
  pills,
  warnWhenUp,
  onClick,
}: {
  title: string;
  card: CostKpiCard;
  showPctOfCtc?: boolean;
  pills?: Array<{ label: string; pct: number | null }>;
  warnWhenUp?: boolean;
  onClick?: () => void;
}) {
  const trendWarn = warnWhenUp && card.direction === "up";
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
        {showPctOfCtc && card.pctOfCtc != null ? (
          <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {card.pctOfCtc}% of CTC
          </div>
        ) : null}
      </div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums text-foreground">
        {inrCompact(card.amount)}
      </div>
      <div className={`mt-1 text-[11px] tabular-nums ${trendWarn ? "font-medium" : ""}`}>
        <TrendVsPrior card={card} upIsBad={warnWhenUp} />
      </div>
      {pills && pills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <span
              key={p.label}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${summaryPillTone(p.label)}`}
            >
              {p.label} {p.pct != null ? `${p.pct}%` : "—"}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-lg border border-border bg-surface p-4 text-left hover:bg-surface-alt"
      >
        {inner}
      </button>
    );
  }
  return <div className="rounded-lg border border-border bg-surface p-4">{inner}</div>;
}

function BreakupKpiCard({
  title,
  card,
  upIsBad,
  borderClass = "border-border-soft",
  onClick,
}: {
  title: string;
  card: CostKpiCard;
  upIsBad?: boolean;
  borderClass?: string;
  onClick?: () => void;
}) {
  const shell = `w-full rounded-lg border bg-surface px-3.5 py-3 text-left ${borderClass}`;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
        <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {card.pctOfCtc != null ? `${card.pctOfCtc}% of CTC` : "— of CTC"}
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-[20px] font-semibold tabular-nums text-foreground">
          {inrCompact(card.amount)}
        </div>
        <div className="shrink-0 pb-0.5 text-right text-[11px] tabular-nums">
          <TrendVsPrior card={card} variant="short" upIsBad={upIsBad} />
        </div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`cursor-pointer hover:bg-surface-alt/60 ${shell}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={shell}>{inner}</div>;
}

function DonutWithLegend({
  data,
  onSliceClick,
  emptyMessage = "No data.",
}: {
  data: Array<{ name: string; value: number; pct?: number | null }>;
  onSliceClick?: (name: string) => void;
  emptyMessage?: string;
}) {
  if (!data.length) {
    return <div className="py-10 text-center text-[12px] text-muted-foreground">{emptyMessage}</div>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
      <div className="mx-auto h-44 w-44 shrink-0 sm:mx-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              onClick={(entry) => {
                const name = (entry as { name?: string })?.name;
                if (name && onSliceClick) onSliceClick(name);
              }}
              className={onSliceClick ? "cursor-pointer" : undefined}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, name) => [inrCompact(Number(v)), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {data.map((d, i) => {
          const pct =
            d.pct != null
              ? d.pct
              : total > 0
                ? Math.round((d.value / total) * 1000) / 10
                : null;
          return (
            <li key={d.name}>
              <button
                type="button"
                disabled={!onSliceClick}
                onClick={() => onSliceClick?.(d.name)}
                className={`flex w-full items-center justify-between gap-3 text-left text-[12px] ${
                  onSliceClick ? "cursor-pointer hover:opacity-80" : "cursor-default"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="truncate text-foreground">{d.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {inrCompact(d.value)}
                  {pct != null ? ` · ${pct}%` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SideDrawer({
  title,
  subtitle,
  onBack,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-start justify-between gap-2 border-b border-border-soft px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="mt-0.5 cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold leading-snug text-foreground">{title}</h2>
              {subtitle ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded p-1 hover:bg-surface-alt">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">{children}</div>
      </div>
    </div>
  );
}

function drawerTitle(d: DrawerState): string {
  if (!d) return "Detail";
  if (d.kind === "lost") return "Lost / Not-Captured Cost";
  if (d.kind === "over") return "Over-Captured Drill-Down";
  if (d.kind === "project") return d.project.name;
  if (d.kind === "department") return d.name;
  if (d.kind === "projects_list") return "Project Cost";
  if (d.kind === "unplanned_list") return "Unplanned Cost";
  return "Detail";
}

function hoursLabel(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n}h`;
}

function moneyCell(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return inrCompact(n);
}

function ProjectCostBreakdownList({
  rows,
  onOpenProject,
}: {
  rows: CostAnalyzerPayload["projects"];
  onOpenProject: (id: string) => Promise<void>;
}) {
  const totalCost = rows.reduce((s, x) => s + x.cost, 0);
  const totalHours = rows.reduce((s, x) => s + x.hours, 0);
  if (rows.length === 0) {
    return <div className="py-8 text-center text-[12px] text-muted-foreground">No project cost.</div>;
  }
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        Project-wise Breakdown
      </h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
          <div>Project</div>
          <div className="text-right">Hours</div>
          <div className="text-right">Cost</div>
          <div className="text-right">%</div>
        </div>
        {rows.map((p) => (
          <button
            key={p.projectId}
            type="button"
            onClick={() => void onOpenProject(p.projectId)}
            className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft px-3 py-2.5 text-left hover:bg-surface-alt/60"
          >
            <div className="truncate text-[12px] font-medium text-foreground">{p.name}</div>
            <div className="text-right text-[12px] tabular-nums text-foreground">{p.hours}</div>
            <div className="text-right text-[12px] font-medium tabular-nums text-foreground">
              {inrCompact(p.cost)}
            </div>
            <div className="text-right text-[12px] tabular-nums text-foreground">
              {totalCost > 0 ? `${((p.cost / totalCost) * 100).toFixed(1)}%` : "—"}
            </div>
          </button>
        ))}
        <BreakdownColumnTotal hours={totalHours} cost={totalCost} />
      </div>
    </div>
  );
}

function BreakdownColumnTotal({
  hours,
  cost,
  pctLabel = "100%",
  gridClass = "grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem]",
  leadingExtra,
}: {
  hours: number;
  cost: number;
  pctLabel?: string;
  gridClass?: string;
  /** Extra empty cells after the Total label (e.g. Dept column). */
  leadingExtra?: number;
}) {
  const hoursDisplay =
    Number.isInteger(hours) || Math.abs(hours - Math.round(hours)) < 1e-9
      ? String(Math.round(hours))
      : (Math.round(hours * 10) / 10).toString();
  return (
    <div className={`grid ${gridClass} gap-x-2 border-t border-border bg-surface-alt px-3 py-2.5`}>
      <div className="text-[12px] font-semibold text-foreground">Total</div>
      {Array.from({ length: leadingExtra ?? 0 }).map((_, i) => (
        <div key={i} />
      ))}
      <div className="text-right text-[12px] font-semibold tabular-nums text-foreground">{hoursDisplay}</div>
      <div className="text-right text-[12px] font-semibold tabular-nums text-foreground">
        {inrCompact(cost)}
      </div>
      <div className="text-right text-[12px] font-semibold tabular-nums text-foreground">{pctLabel}</div>
    </div>
  );
}

function UnplannedCostBreakdownList({
  reasons,
  employees,
}: {
  reasons: CostAnalyzerPayload["unplannedReasons"];
  employees: CostAnalyzerPayload["unplannedEmployees"];
}) {
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [openEmp, setOpenEmp] = useState<string | null>(null);

  const reasonHours = reasons.reduce((s, r) => s + r.hours, 0);
  const reasonCost = reasons.reduce((s, r) => s + r.cost, 0);
  const employeeHours = employees.reduce((s, e) => s + e.hours, 0);
  const employeeCost = employees.reduce((s, e) => s + e.cost, 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Unplanned Reason-wise Breakdown
        </h3>
        {reasons.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-muted-foreground">No unplanned cost.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
              <div>Reason</div>
              <div className="text-right">Hours</div>
              <div className="text-right">Cost</div>
              <div className="text-right">%</div>
            </div>
            {reasons.map((r) => {
              const open = openReason === r.reason;
              return (
                <div key={r.reason} className="border-b border-border-soft">
                  <button
                    type="button"
                    onClick={() => setOpenReason(open ? null : r.reason)}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 px-3 py-2.5 text-left hover:bg-surface-alt/60"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                      <span className="truncate text-[12px] font-medium text-foreground">{r.reason}</span>
                    </div>
                    <div className="self-center text-right text-[12px] tabular-nums">{r.hours}</div>
                    <div className="self-center text-right text-[12px] font-medium tabular-nums">
                      {inrCompact(r.cost)}
                    </div>
                    <div className="self-center text-right text-[12px] tabular-nums">
                      {r.pctShare == null ? "—" : `${r.pctShare}%`}
                    </div>
                  </button>
                  {open ? (
                    <div className="border-t border-border-soft bg-surface-alt/40 px-3 py-2">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                        Employee within {r.reason}
                      </div>
                      {(r.employees ?? []).length === 0 ? (
                        <div className="py-2 text-[11px] text-muted-foreground">No employees.</div>
                      ) : (
                        (r.employees ?? []).map((e) => (
                          <div
                            key={e.employeeId}
                            className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 py-1.5"
                          >
                            <div className="min-w-0 pl-5">
                              <div className="truncate text-[12px] font-medium text-foreground">
                                {e.name}
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {e.department ?? "—"}
                              </div>
                            </div>
                            <div className="self-center text-right text-[12px] tabular-nums">{e.hours}</div>
                            <div className="self-center text-right text-[12px] tabular-nums">
                              {inrCompact(e.cost)}
                            </div>
                            <div className="self-center text-right text-[12px] tabular-nums">
                              {e.pctShare == null ? "—" : `${e.pctShare}%`}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <BreakdownColumnTotal hours={reasonHours} cost={reasonCost} />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Unplanned Employee-wise Breakdown
        </h3>
        {employees.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-muted-foreground">No unplanned cost.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
              <div>Employee</div>
              <div className="text-right">Hours</div>
              <div className="text-right">Cost</div>
              <div className="text-right">%</div>
            </div>
            {employees.map((e) => {
              const open = openEmp === e.employeeId;
              return (
                <div key={e.employeeId} className="border-b border-border-soft">
                  <button
                    type="button"
                    onClick={() => setOpenEmp(open ? null : e.employeeId)}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 px-3 py-2.5 text-left hover:bg-surface-alt/60"
                  >
                    <div className="flex min-w-0 items-start gap-1.5">
                      {open ? (
                        <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-foreground">{e.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {e.department ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div className="self-center text-right text-[12px] tabular-nums">{e.hours}</div>
                    <div className="self-center text-right text-[12px] font-medium tabular-nums">
                      {inrCompact(e.cost)}
                    </div>
                    <div className="self-center text-right text-[12px] tabular-nums">
                      {e.pctShare == null ? "—" : `${e.pctShare}%`}
                    </div>
                  </button>
                  {open ? (
                    <div className="border-t border-border-soft bg-surface-alt/40 px-3 py-2">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                        Reason within {e.name}
                      </div>
                      {e.reasons.map((r) => (
                        <div
                          key={r.reason}
                          className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 py-1.5"
                        >
                          <div className="truncate pl-5 text-[12px] text-foreground">{r.reason}</div>
                          <div className="text-right text-[12px] tabular-nums">{r.hours}</div>
                          <div className="text-right text-[12px] tabular-nums">{inrCompact(r.cost)}</div>
                          <div className="text-right text-[12px] tabular-nums">
                            {r.pctShare == null ? "—" : `${r.pctShare}%`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <BreakdownColumnTotal hours={employeeHours} cost={employeeCost} />
          </div>
        )}
      </div>
    </div>
  );
}

function LostCostEmployeeList({ rows }: { rows: Array<Record<string, string | number | null>> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return <div className="py-8 text-center text-[12px] text-muted-foreground">No employees with lost cost.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        Employees with Lost Cost
      </h3>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_4.75rem_3.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
          <div>Employee</div>
          <div className="text-right">Lost</div>
          <div className="text-right">Lost h</div>
          <div className="text-right">Cap %</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.map((r, i) => {
            const key = String(r.hrmsId ?? r.employee ?? i);
            const open = expanded === key;
            return (
              <div key={key} className="border-b border-border-soft last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : key)}
                  className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_4.75rem_3.5rem_3rem] gap-x-2 px-3 py-2.5 text-left hover:bg-surface-alt/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-foreground">
                      {String(r.employee ?? "—")}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {r.department ? String(r.department) : "—"}
                    </div>
                  </div>
                  <div className="self-center text-right text-[12px] font-medium tabular-nums text-foreground">
                    {moneyCell(r.lostCost)}
                  </div>
                  <div className="self-center text-right text-[12px] tabular-nums text-foreground">
                    {hoursLabel(r.lostHours)}
                  </div>
                  <div className="self-center text-right text-[12px] tabular-nums text-foreground">
                    {r.capturePct == null ? "—" : `${r.capturePct}%`}
                  </div>
                </button>
                {open ? (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-border-soft bg-surface-alt/40 px-3 py-2.5 text-[11px]">
                    {(
                      [
                        ["CTC", moneyCell(r.totalCtc)],
                        ["Captured", moneyCell(r.capturedCost)],
                        ["Eligible", hoursLabel(r.eligibleHours)],
                        ["Project", hoursLabel(r.projectHours)],
                        ["Unplanned", hoursLabel(r.unplannedHours)],
                        ["Captured h", hoursLabel(r.capturedHours)],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-right font-medium tabular-nums text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DrawerBody({
  drawer,
  formatDate,
  onOpenProject,
  onShowAllDepartments,
}: {
  drawer: Exclude<DrawerState, null>;
  formatDate: (iso: string) => string;
  onOpenProject: (id: string) => Promise<void>;
  onShowAllDepartments?: () => void;
}) {
  if (drawer.kind === "lost") {
    return <LostCostEmployeeList rows={drawer.rows} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <DrawerBodyScrollable
        drawer={drawer}
        formatDate={formatDate}
        onOpenProject={onOpenProject}
        onShowAllDepartments={onShowAllDepartments}
      />
    </div>
  );
}

function DrawerBodyScrollable({
  drawer,
  formatDate,
  onOpenProject,
  onShowAllDepartments,
}: {
  drawer: Exclude<Exclude<DrawerState, null>, { kind: "lost" }>;
  formatDate: (iso: string) => string;
  onOpenProject: (id: string) => Promise<void>;
  onShowAllDepartments?: () => void;
}) {
  if (drawer.kind === "over") {
    const cols = [
      "employee",
      "department",
      "eligibleHours",
      "projectHours",
      "unplannedHours",
      "capturedHours",
      "overCapturedHours",
      "totalCtc",
      "capturedCost",
      "overCapturedCost",
    ];
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase text-muted">
              {cols.map((c) => (
                <th key={c} className="pb-2 pr-2 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drawer.rows.map((r, i) => (
              <tr key={i} className="border-t border-border-soft">
                {cols.map((c) => {
                  const v = r[c];
                  const isMoney =
                    typeof c === "string" &&
                    (c.toLowerCase().includes("cost") || c.toLowerCase().includes("ctc"));
                  return (
                    <td key={c} className="py-1.5 pr-2 tabular-nums">
                      {v == null
                        ? "—"
                        : isMoney && typeof v === "number"
                          ? inrCompact(v)
                          : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {drawer.rows.length === 0 && (
          <div className="py-8 text-center text-[12px] text-muted-foreground">No rows.</div>
        )}
      </div>
    );
  }

  if (drawer.kind === "projects_list") {
    return <ProjectCostBreakdownList rows={drawer.rows} onOpenProject={onOpenProject} />;
  }

  if (drawer.kind === "unplanned_list") {
    return (
      <UnplannedCostBreakdownList reasons={drawer.reasons} employees={drawer.employees} />
    );
  }

  if (drawer.kind === "project") {
    const p = drawer.project;
    const scopeToDepartment =
      Boolean(drawer.fromDepartment) && drawer.showAllDepartments !== true;
    const deptFilterName = scopeToDepartment ? drawer.fromDepartment!.name : null;
    const departments = deptFilterName
      ? drawer.departments.filter((d) => d.name === deptFilterName)
      : drawer.departments;
    const employees = deptFilterName
      ? drawer.employees.filter((e) => (e.department ?? "Unassigned") === deptFilterName)
      : drawer.employees;
    const deptHours = departments.reduce((s, d) => s + d.hours, 0);
    const deptCost = departments.reduce((s, d) => s + d.cost, 0);
    const empHours = employees.reduce((s, e) => s + e.hours, 0);
    const empCost = employees.reduce((s, e) => s + e.cost, 0);
    const summaryRows: Array<{ label: string; value: string }> = [
      {
        label: "Dates",
        value:
          p.startDate && p.endDate
            ? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`
            : "—",
      },
      { label: "PO", value: p.poNumber?.trim() || "—" },
      {
        label: "Period",
        value:
          drawer.from && drawer.to
            ? `${formatDate(drawer.from)} – ${formatDate(drawer.to)}`
            : "—",
      },
      { label: "Actual Hours", value: `${p.hours}h` },
      { label: "Total Cost", value: inrCompact(p.cost) },
      {
        label: "Company Share",
        value:
          p.companySharePct != null ? `${p.companySharePct}% of Captured` : "—",
      },
    ];
    return (
      <div className="space-y-5 text-[12px]">
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
          {summaryRows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-border-soft py-1.5 last:border-b-0"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-right font-medium tabular-nums text-foreground">{row.value}</span>
            </div>
          ))}
          {p.outsidePeriodCost > 0 ? (
            <div className="mt-1.5 text-[11px] text-warning">
              Outside period {inrCompact(p.outsidePeriodCost)} · {p.outsidePeriodHours}h
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              Department Contribution
            </h3>
            {scopeToDepartment && onShowAllDepartments ? (
              <button
                type="button"
                onClick={onShowAllDepartments}
                className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
              >
                Show all
              </button>
            ) : null}
          </div>
          {departments.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">No departments.</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
                <div>Department</div>
                <div className="text-right">Hours</div>
                <div className="text-right">Cost</div>
                <div className="text-right">%</div>
              </div>
              {departments.map((d) => (
                <div
                  key={d.name}
                  className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft px-3 py-2.5"
                >
                  <div className="truncate font-medium text-foreground">{d.name}</div>
                  <div className="text-right tabular-nums">{d.hours}</div>
                  <div className="text-right font-medium tabular-nums">{inrCompact(d.cost)}</div>
                  <div className="text-right tabular-nums">
                    {d.pctOfProject == null ? "—" : `${d.pctOfProject}%`}
                  </div>
                </div>
              ))}
              <BreakdownColumnTotal hours={deptHours} cost={deptCost} />
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Employee Contribution
          </h3>
          {employees.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">No employees.</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
                <div>Employee</div>
                <div className="text-right">Hours</div>
                <div className="text-right">Cost</div>
                <div className="text-right">%</div>
              </div>
              {employees.map((e) => (
                <div
                  key={e.name}
                  className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{e.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {e.department ?? "—"}
                    </div>
                  </div>
                  <div className="self-center text-right tabular-nums">{e.hours}</div>
                  <div className="self-center text-right font-medium tabular-nums">{inrCompact(e.cost)}</div>
                  <div className="self-center text-right tabular-nums">
                    {e.pctOfProject == null ? "—" : `${e.pctOfProject}%`}
                  </div>
                </div>
              ))}
              <BreakdownColumnTotal hours={empHours} cost={empCost} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // department
  const projectTotal = drawer.projects.reduce((s, p) => s + p.cost, 0);
  const projectHours = drawer.projects.reduce((s, p) => s + p.hours, 0);
  const unplannedTotal = drawer.unplannedReasons.reduce((s, r) => s + r.cost, 0);
  const unplannedHours = drawer.unplannedReasons.reduce((s, r) => s + r.hours, 0);
  const empHours = drawer.employees.reduce((s, e) => s + e.hours, 0);
  const empCost = drawer.employees.reduce((s, e) => s + e.cost, 0);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Project-wise Cost
        </h3>
        {drawer.projects.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-muted-foreground">No project cost.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
              <div>Project</div>
              <div className="text-right">Hours</div>
              <div className="text-right">Cost</div>
              <div className="text-right">%</div>
            </div>
            {drawer.projects.map((p) => (
              <button
                key={p.projectId}
                type="button"
                onClick={() => void onOpenProject(p.projectId)}
                className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft px-3 py-2.5 text-left hover:bg-surface-alt/60"
              >
                <div className="truncate text-[12px] font-medium text-foreground">{p.name}</div>
                <div className="text-right text-[12px] tabular-nums">{p.hours}</div>
                <div className="text-right text-[12px] font-medium tabular-nums">{inrCompact(p.cost)}</div>
                <div className="text-right text-[12px] tabular-nums">
                  {projectTotal > 0 ? `${((p.cost / projectTotal) * 100).toFixed(1)}%` : "—"}
                </div>
              </button>
            ))}
            <BreakdownColumnTotal hours={projectHours} cost={projectTotal} />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Unplanned Reason-wise Cost
        </h3>
        {drawer.unplannedReasons.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-muted-foreground">No unplanned cost.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
              <div>Reason</div>
              <div className="text-right">Hours</div>
              <div className="text-right">Cost</div>
              <div className="text-right">%</div>
            </div>
            {drawer.unplannedReasons.map((r) => (
              <div
                key={r.reason}
                className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3rem] gap-x-2 border-b border-border-soft px-3 py-2.5"
              >
                <div className="truncate text-[12px] font-medium text-foreground">{r.reason}</div>
                <div className="text-right text-[12px] tabular-nums">{r.hours}</div>
                <div className="text-right text-[12px] font-medium tabular-nums">{inrCompact(r.cost)}</div>
                <div className="text-right text-[12px] tabular-nums">
                  {unplannedTotal > 0
                    ? `${((r.cost / unplannedTotal) * 100).toFixed(1)}%`
                    : r.pctShare == null
                      ? "—"
                      : `${r.pctShare}%`}
                </div>
              </div>
            ))}
            <BreakdownColumnTotal hours={unplannedHours} cost={unplannedTotal} />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Employee Contribution
        </h3>
        {drawer.employees.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-muted-foreground">No employees.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_4.25rem] gap-x-2 border-b border-border-soft bg-surface-alt px-3 py-2 text-[13px] font-semibold text-muted">
              <div>Employee</div>
              <div className="text-right">Hours</div>
              <div className="text-right">Cost</div>
              <div className="text-right">Capture %</div>
            </div>
            {drawer.employees.map((e) => (
              <div
                key={e.employee}
                className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_4.25rem] gap-x-2 border-b border-border-soft px-3 py-2.5"
              >
                <div className="truncate text-[12px] font-medium text-foreground">{e.employee}</div>
                <div className="text-right text-[12px] tabular-nums">{e.hours}</div>
                <div className="text-right text-[12px] font-medium tabular-nums">{inrCompact(e.cost)}</div>
                <div className="text-right text-[12px] tabular-nums">
                  {e.capturePct != null
                    ? `${e.capturePct}%`
                    : e.pct == null
                      ? "—"
                      : `${e.pct}%`}
                </div>
              </div>
            ))}
            <BreakdownColumnTotal
              hours={empHours}
              cost={empCost}
              pctLabel="—"
              gridClass="grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_4.25rem]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
