import { MILESTONE_KIND_OPTIONS } from "../data/projects";
import type { MilestoneKind } from "../data/projects";

export function MilestoneKindPicker({
  value,
  onChange,
  required = false,
}: {
  value: MilestoneKind | "";
  onChange: (kind: MilestoneKind) => void;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="text-[11px] font-medium text-foreground">Milestone Type</span>
        {required && <span className="text-[11px] text-danger">*</span>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MilestoneKind)}
        className={`w-full rounded-md border bg-surface px-3 py-1.5 text-[12px] outline-none focus:border-accent-line ${
          value ? "border-border text-foreground" : "border-warning-border text-muted-foreground"
        }`}
      >
        <option value="">Select milestone type…</option>
        {MILESTONE_KIND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
