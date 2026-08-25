import { useMemo } from "react";
import { FilterSingleSelect } from "./FilterSingleSelect";
import { WORK_DATE_DAYS } from "../utils/workDateDayFilter";

export function WorkDateDaySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (day: number | null) => void;
}) {
  const options = useMemo(
    () => [
      { value: "", label: "All dates" },
      ...WORK_DATE_DAYS.map((d) => ({ value: String(d), label: String(d) })),
    ],
    []
  );

  return (
    <FilterSingleSelect
      aria-label="Work Date"
      value={value == null ? "" : String(value)}
      onChange={(raw) => onChange(raw === "" ? null : Number(raw))}
      options={options}
    />
  );
}
