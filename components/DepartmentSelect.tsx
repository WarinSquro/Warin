import { FilterMultiSelect } from "./FilterMultiSelect";

export function DepartmentSelect({
  departments,
  selected,
  onChange,
  counts,
  align = "start",
  showCounts = true,
}: {
  departments: readonly string[];
  selected: string[];
  onChange: (depts: string[]) => void;
  counts: Record<string, number>;
  align?: "start" | "end";
  /** When false, hide trailing counts in the menu (Cost Analyzer). */
  showCounts?: boolean;
}) {
  return (
    <FilterMultiSelect
      items={departments}
      selected={selected}
      onChange={onChange}
      counts={counts}
      allLabel="All Departments"
      pluralLabel="Departments"
      align={align}
      showCounts={showCounts}
    />
  );
}
