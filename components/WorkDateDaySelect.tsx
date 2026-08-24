import { WORK_DATE_DAYS } from "../utils/workDateDayFilter";

export function WorkDateDaySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (day: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Work Date</span>
      <select
        value={value == null ? "" : String(value)}
        aria-label="Work Date"
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        className="min-w-[90px] cursor-pointer rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
      >
        <option value="">All dates</option>
        {WORK_DATE_DAYS.map((d) => (
          <option key={d} value={String(d)}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
