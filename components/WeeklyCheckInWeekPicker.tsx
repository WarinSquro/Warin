import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getReviewWeeks, type ReviewWeekOption } from "../data/weeklyCheckIn";
import { useSettings } from "../context/SettingsContext";

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
      <select
        value={weekStart}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[11rem] rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
      >
        {weeks.map((w) => (
          <option key={w.weekStart} value={w.weekStart}>
            {w.isCurrent ? `This week · ${w.label}` : w.label}
          </option>
        ))}
      </select>
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
