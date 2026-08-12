import { Fragment, useState } from "react";
import { Info, X } from "lucide-react";
import type { DepartmentCompetency, RankingLevel } from "../data/weeklyCheckIn";
import { competencyFocusId, rankingChipClass } from "../data/weeklyCheckIn";

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
  const [guideOpen, setGuideOpen] = useState(false);
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
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="min-w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border-soft bg-surface-alt/50">
              <th className="sticky left-0 z-10 min-w-[7.5rem] border-r border-border-soft bg-surface-alt/50 px-2.5 py-2 text-left font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Competency
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="inline-flex cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-surface hover:text-primary"
                    aria-label="View competency guide"
                    title="View competency guide"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </span>
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
                    <span className="ml-0.5 font-normal normal-case tracking-normal text-danger" aria-hidden>
                      *
                    </span>
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
                    {sorted.map((level, levelIdx) => {
                      const selected = group.ratings[comp.id] === level.value;
                      return (
                        <td key={level.value} className="px-1 py-1.5 text-center">
                          <RatingCell
                            level={level}
                            selected={selected}
                            disabled={disabled}
                            focusId={levelIdx === 0 ? competencyFocusId(comp.id) : undefined}
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

      {guideOpen ? (
        <CompetencyGuideModal groups={nonEmptyGroups} onClose={() => setGuideOpen(false)} />
      ) : null}
    </>
  );
}

function CompetencyGuideModal({
  groups,
  onClose,
}: {
  groups: CompetencyRatingGroup[];
  onClose: () => void;
}) {
  const sectionTitle = (title: string) =>
    title === "Technical"
      ? "Technical Competencies"
      : title === "Behavioural"
        ? "Behavioural Competencies"
        : title;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="competency-guide-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-3.5">
          <div id="competency-guide-title" className="text-[15px] font-semibold text-foreground">
            Technical & Behavioural competencies
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full table-fixed border-collapse text-[12px]">
              <colgroup>
                <col className="w-12" />
                <col className="w-[32%]" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="border-r border-border px-2.5 py-2 text-left font-semibold text-foreground">
                    #
                  </th>
                  <th className="border-r border-border px-2.5 py-2 text-left font-semibold text-foreground">
                    Competency
                  </th>
                  <th className="px-2.5 py-2 text-left font-semibold text-foreground">What it evaluates</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="border-b border-border bg-surface-alt/70">
                      <td
                        colSpan={3}
                        className="px-2.5 py-2 text-[12px] font-semibold text-foreground"
                      >
                        {sectionTitle(group.title)}
                      </td>
                    </tr>
                    {group.competencies.map((c, i) => (
                      <tr key={c.id} className="border-b border-border last:border-b-0">
                        <td className="border-r border-border px-2.5 py-2 align-top text-muted-foreground">
                          {c.sequence || i + 1}
                        </td>
                        <td className="border-r border-border px-2.5 py-2 align-top font-medium text-foreground">
                          {c.label}
                        </td>
                        <td className="break-words px-2.5 py-2 align-top text-muted-foreground">
                          {c.remark?.trim() ? c.remark : "—"}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function RatingCell({
  level,
  selected,
  disabled,
  focusId,
  onSelect,
}: {
  level: RankingLevel;
  selected: boolean;
  disabled?: boolean;
  /** Anchor for sequential validation focus (first rating control in the row). */
  focusId?: string;
  onSelect: () => void;
}) {
  if (disabled) {
    return selected ? (
      <div
        id={focusId}
        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold ${rankingChipClass(level, true)}`}
        title={level.title}
      >
        {level.value}
      </div>
    ) : (
      <div id={focusId} className="mx-auto h-7 w-7" aria-hidden />
    );
  }

  return (
    <button
      id={focusId}
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
