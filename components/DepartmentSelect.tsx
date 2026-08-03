import { FilterMultiSelect } from "./FilterMultiSelect";

export function DepartmentSelect({
  departments,
  selected,
  onChange,
  counts,
  align = "start",
}: {
  departments: readonly string[];
  selected: string[];
  onChange: (depts: string[]) => void;
  counts: Record<string, number>;
  align?: "start" | "end";
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
    />
  );
}
