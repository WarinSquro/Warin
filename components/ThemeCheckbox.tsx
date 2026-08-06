import { Check, Minus } from "lucide-react";

/** Theme checkbox matching FilterMultiSelect (primary fill + white mark). */
export function ThemeCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  "aria-label": ariaLabel,
  className = "",
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  "aria-label"?: string;
  className?: string;
}) {
  const filled = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onChange?.();
      }}
      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
        filled ? "border-primary bg-primary text-white" : "border-border bg-surface"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} aria-hidden />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
      ) : null}
    </button>
  );
}
