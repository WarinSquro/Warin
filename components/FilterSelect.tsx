export type FilterSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Native single-select — same chrome as Leave Type and other form `<select>`s.
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
  const hasValue = options.some((o) => o.value === value);

  return (
    <select
      value={hasValue ? value : ""}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full cursor-pointer rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="" disabled>
        {options.length === 0 ? "No options" : placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value || "__empty"} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
