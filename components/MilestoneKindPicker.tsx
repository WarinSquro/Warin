import { MILESTONE_KIND_OPTIONS } from "../data/projects";
import type { MilestoneKind } from "../data/projects";
import { FilterSelect } from "./FilterSelect";

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
      <FilterSelect
        value={value}
        onChange={(v) => {
          if (v) onChange(v as MilestoneKind);
        }}
        options={MILESTONE_KIND_OPTIONS}
        placeholder="Select milestone type…"
        aria-label="Milestone Type"
      />
    </div>
  );
}
