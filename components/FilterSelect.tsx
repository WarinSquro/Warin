import { useEffect, useRef, useState } from "react";

export type FilterSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Single-select dropdown matching Warin filter / form chrome
 * (WorkDateDaySelect / MinFreeHoursSelect pattern).
 */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  menuClassName = "",
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className={`relative min-w-0 ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-[12px] text-foreground outline-none hover:bg-surface-alt focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted disabled:hover:bg-surface-alt ${
          !selected ? "text-muted-foreground" : ""
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          ▾
        </span>
      </button>
      {open && !disabled && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 top-[calc(100%+4px)] z-50 max-h-[240px] min-w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg ${menuClassName}`}
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-muted-foreground">No options</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSelected ? "bg-surface-alt font-medium text-foreground" : "text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
