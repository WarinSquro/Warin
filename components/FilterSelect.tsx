import { FilterSingleSelect, type FilterSingleSelectOption } from "./FilterSingleSelect";

export type FilterSelectOption = FilterSingleSelectOption;

/**
 * Single-select for forms and filters — same chrome as FilterMultiSelect / FilterSingleSelect.
 * Always renders one empty-value row (placeholder or an option whose value is "").
 */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  "aria-label"?: string;
}) {
  const emptyFromOptions = options.find((o) => o.value === "");
  const selectable = options.filter((o) => o.value !== "");
  const emptyLabel =
    emptyFromOptions?.label ?? (selectable.length === 0 ? "No options" : placeholder);
  const hasValue = selectable.some((o) => o.value === value);

  const normalized: FilterSingleSelectOption[] = [
    {
      value: "",
      label: emptyLabel,
      disabled: emptyFromOptions ? Boolean(emptyFromOptions.disabled) : true,
    },
    ...selectable,
  ];

  return (
    <FilterSingleSelect
      value={hasValue ? value : ""}
      onChange={onChange}
      options={normalized}
      placeholder={emptyLabel}
      disabled={disabled}
      fullWidth
      aria-label={ariaLabel}
      className={className}
    />
  );
}
