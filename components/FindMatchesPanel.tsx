import { useEffect, useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import type { Candidate, Demand, AllocationSlice } from "../data/planner";
import { CURRENT_WEEK_INDEX, WEEK_START_ISO } from "../data/planner";
import { FilterMultiSelect } from "./FilterMultiSelect";
import { MinFreeHoursSelect } from "./MinFreeHoursSelect";
import { DepartmentSelect } from "./DepartmentSelect";
import { MIN_FREE_HOUR_OPTIONS } from "../data/availability";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { buildCandidatesFromEmployees } from "../api/liveViews";

interface Props {
  demand: Demand | null;
  /** Live allocations for the planner window — used to compute free hours. */
  allocations?: AllocationSlice[];
  onClose: () => void;
  onAllocate: (c: Candidate) => void;
}

function skillsMatchingDemand(demandRole: string, allSkills: string[]) {
  const q = demandRole.toLowerCase();
  const MATCH_SKILLS = allSkills;

  if (q.includes("qa") || q.includes("test")) {
    return MATCH_SKILLS.filter(
      (s) =>
        s.toLowerCase().includes("selenium") ||
        s.toLowerCase().includes("playwright") ||
        s.toLowerCase().includes("qa")
    );
  }

  if (q.includes("backend") || q.includes("dev")) {
    return MATCH_SKILLS.filter(
      (s) =>
        ["Node.js", "PostgreSQL", "Java / Spring", "Python / Django", "Go / gRPC"].includes(s) ||
        s.toLowerCase().includes("node") ||
        s.toLowerCase().includes("java") ||
        s.toLowerCase().includes("python")
    );
  }

  if (q.includes("design") || q.includes("ux")) {
    return MATCH_SKILLS.filter(
      (s) => s.toLowerCase().includes("figma") || s.toLowerCase().includes("ux")
    );
  }

  const matched = MATCH_SKILLS.filter((s) =>
    q.split(/[\s,/]+/).some((part) => part && s.toLowerCase().includes(part))
  );
  return matched.length > 0 ? matched : [...MATCH_SKILLS];
}

function minFreeHourOptionsForDemand(_hoursPerWeek: number) {
  return [...MIN_FREE_HOUR_OPTIONS];
}

export function FindMatchesPanel({ demand, allocations = [], onClose, onAllocate }: Props) {
  const open = !!demand;
  const { employees } = usePlanningEmployees();
  const { departments: deptRows, skills: skillRows } = useMasters();
  const { settings } = useSettings();
  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;
  const weekStart = WEEK_START_ISO[CURRENT_WEEK_INDEX] ?? WEEK_START_ISO[0];

  const allCandidates = useMemo(
    () => buildCandidatesFromEmployees(employees, weekCapacity, allocations, weekStart),
    [employees, weekCapacity, allocations, weekStart]
  );
  const matchSkills = useMemo(
    () => skillRows.filter((s) => s.status === "active").map((s) => s.name).sort(),
    [skillRows]
  );
  const departments = useMemo(
    () => deptRows.filter((d) => d.status === "active").map((d) => d.name),
    [deptRows]
  );

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [minFreeHours, setMinFreeHours] = useState(0);

  const hourOptions = useMemo(
    () => minFreeHourOptionsForDemand(demand?.hoursPerWeek ?? 0),
    [demand?.hoursPerWeek]
  );

  useEffect(() => {
    if (!demand) return;
    setSelectedSkills(skillsMatchingDemand(demand.role, matchSkills));
    setSelectedDepts([...departments]);
    setMinFreeHours(demand.hoursPerWeek);
  }, [demand?.id, demand?.role, demand?.hoursPerWeek, matchSkills, departments]);

  const skillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const skill of matchSkills) {
      counts[skill] = allCandidates.filter((c) =>
        c.skills.some((s) => s.name === skill && s.has)
      ).length;
    }
    return counts;
  }, [matchSkills, allCandidates]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dept of departments) {
      counts[dept] = allCandidates.filter((c) => c.dept === dept).length;
    }
    return counts;
  }, [departments, allCandidates]);

  const minFreeHourCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const option of hourOptions) {
      counts[option.value] = allCandidates.filter((c) => c.freeHours >= option.value).length;
    }
    return counts;
  }, [hourOptions, allCandidates]);

  const candidates = useMemo(() => {
    const skillsActive =
      selectedSkills.length > 0 && selectedSkills.length < matchSkills.length;

    return [...allCandidates]
      .filter((c) => {
        if (!selectedDepts.includes(c.dept)) return false;
        if (c.freeHours < minFreeHours) return false;
        if (
          skillsActive &&
          !selectedSkills.some((skill) => c.skills.some((s) => s.name === skill && s.has))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.fitScore - a.fitScore);
  }, [allCandidates, selectedSkills, selectedDepts, minFreeHours, matchSkills.length]);

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-brand/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-[420px] flex-col bg-surface shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex-shrink-0 border-b border-border-soft px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold text-foreground">Find Matches</div>
              {demand && (
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                  {demand.project} · {demand.role} · {demand.hoursPerWeek}h/wk
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterMultiSelect
              items={matchSkills}
              selected={selectedSkills}
              onChange={setSelectedSkills}
              counts={skillCounts}
              allLabel="Skills"
              pluralLabel="skills"
            />
            <DepartmentSelect
              departments={departments}
              selected={selectedDepts}
              onChange={setSelectedDepts}
              counts={deptCounts}
            />
            <MinFreeHoursSelect
              value={minFreeHours}
              onChange={setMinFreeHours}
              options={hourOptions}
              counts={minFreeHourCounts}
              defaultLabel="Min free hrs"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              No matching people · add employees with skills in Employee Master
            </div>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-border px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold text-muted">
                        {c.initials}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-foreground">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.role} · {c.dept}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAllocate(c)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                    >
                      <Plus className="h-3 w-3" /> Allocate
                    </button>
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {c.freeHours}h free · {c.availability}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
