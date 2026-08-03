import { Fragment } from "react";
import type { DepartmentCompetency, RankingLevel } from "../data/weeklyCheckIn";
import { rankingChipClass } from "../data/weeklyCheckIn";

export interface CompetencyRatingGroup {
  title: string;
  competencies: DepartmentCompetency[];
  ratings: Record<string, number>;
  onChange: (competencyId: string, value: number) => void;
}

interface WeeklyCheckInCompetencyRatingProps {
  groups: CompetencyRatingGroup[];
  rankingLevels: RankingLevel[];
  disabled?: boolean;
}

export function WeeklyCheckInCompetencyRating({
  groups,
  rankingLevels,
  disabled,
}: WeeklyCheckInCompetencyRatingProps) {
  const sorted = [...rankingLevels].sort((a, b) => b.value - a.value);
  const colCount = sorted.length + 1;
  const nonEmptyGroups = groups.filter((g) => g.competencies.length > 0);

  if (nonEmptyGroups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-alt/50 px-3 py-4 text-[12px] text-muted-foreground">
        No competencies configured for this department.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
      <table className="min-w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-border-soft bg-surface-alt/50">
            <th className="sticky left-0 z-10 min-w-[7.5rem] border-r border-border-soft bg-surface-alt/50 px-2.5 py-2 text-left font-medium text-muted-foreground">
              Competency
            </th>
            {sorted.map((level) => (
              <th
                key={level.value}
                className="min-w-[3.25rem] px-1 py-2 text-center font-medium"
                title={level.title}
              >
                <div
                  className={`mx-auto mb-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${rankingChipClass(level, true)}`}
                >
                  {level.value}
                </div>
                <div className="mx-auto max-w-[3.25rem] text-[9px] font-normal leading-tight text-muted-foreground">
                  {level.title}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nonEmptyGroups.map((group, groupIdx) => (
            <Fragment key={group.title}>
              <tr key={`section-${group.title}`} className="border-b border-border-soft bg-surface-alt/70">
                <td
                  colSpan={colCount}
                  className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.title}
                </td>
              </tr>
              {group.competencies.map((comp, rowIdx) => (
                <tr
                  key={comp.id}
                  className={`border-b border-border-soft hover:bg-surface-alt/40 ${
                    groupIdx === nonEmptyGroups.length - 1 &&
                    rowIdx === group.competencies.length - 1
                      ? "border-b-0"
                      : ""
                  }`}
                >
                  <td
                    className="sticky left-0 z-10 border-r border-border-soft bg-surface px-2.5 py-1.5 font-medium text-foreground"
                    title={comp.label}
                  >
                    <span className="line-clamp-2">{comp.label}</span>
                  </td>
                  {sorted.map((level) => {
                    const selected = group.ratings[comp.id] === level.value;
                    return (
                      <td key={level.value} className="px-1 py-1.5 text-center">
                        <RatingCell
                          level={level}
                          selected={selected}
                          disabled={disabled}
                          onSelect={() => group.onChange(comp.id, level.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RatingCell({
  level,
  selected,
  disabled,
  onSelect,
}: {
  level: RankingLevel;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  if (disabled) {
    return selected ? (
      <div
        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold ${rankingChipClass(level, true)}`}
        title={level.title}
      >
        {level.value}
      </div>
    ) : (
      <div className="mx-auto h-7 w-7" aria-hidden />
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${level.title} (${level.value})`}
      onClick={onSelect}
      className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
        selected
          ? rankingChipClass(level, true)
          : "border-border bg-surface text-transparent hover:border-accent-line hover:bg-surface-alt"
      }`}
    >
      {selected ? (
        <span className="text-[11px] font-bold">{level.value}</span>
      ) : (
        <span className="h-2.5 w-2.5 rounded-full border border-border bg-surface" />
      )}
    </button>
  );
}
