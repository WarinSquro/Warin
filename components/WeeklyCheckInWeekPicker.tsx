import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getReviewWeeks, type ReviewWeekOption } from "../data/weeklyCheckIn";
import { useSettings } from "../context/SettingsContext";
import { FilterSingleSelect } from "./FilterSingleSelect";

interface WeeklyCheckInWeekPickerProps {
  weekStart: string;
  onChange: (weekStart: string) => void;
  weeks?: ReviewWeekOption[];
}

export function WeeklyCheckInWeekPicker({
  weekStart,
  onChange,
  weeks: weeksProp,
}: WeeklyCheckInWeekPickerProps) {
  const { settings } = useSettings();
  const weeksFromSettings = useMemo(
    () => getReviewWeeks(settings.workingDays),
    [settings.workingDays]
  );
  const weeks = weeksProp ?? weeksFromSettings;
  const idx = weeks.findIndex((w) => w.weekStart === weekStart);

  const goPrev = () => {
    if (idx > 0) onChange(weeks[idx - 1].weekStart);
  };
  const goNext = () => {
    if (idx >= 0 && idx < weeks.length - 1) onChange(weeks[idx + 1].weekStart);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goPrev}
        disabled={idx <= 0}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-alt disabled:opacity-40"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <FilterSingleSelect
        value={weekStart}
        onChange={onChange}
        options={weeks.map((w) => ({
          value: w.weekStart,
          label: w.isCurrent ? `This week · ${w.label}` : w.label,
        }))}
        className="min-w-[11rem]"
        aria-label="Review week"
      />
      <button
        type="button"
        onClick={goNext}
        disabled={idx < 0 || idx >= weeks.length - 1}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-alt disabled:opacity-40"
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
