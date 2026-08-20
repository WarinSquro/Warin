import { useEffect, useRef, useState } from "react";
import { WORK_DATE_DAYS, workDateDayFilterLabel } from "../utils/workDateDayFilter";

/** Visible rows in the open menu before scrolling (All dates + day numbers). */
const VISIBLE_OPTIONS = 8;
/** Row height for option buttons — keep in sync with option `h-7` class. */
const OPTION_ROW_PX = 28;

export function WorkDateDaySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (day: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = workDateDayFilterLabel(value);

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

  const options: Array<{ value: number | null; label: string }> = [
    { value: null, label: "All dates" },
    ...WORK_DATE_DAYS.map((d) => ({ value: d, label: String(d) })),
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Work Date</span>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Work Date"
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex min-w-[90px] cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
        >
          <span className="truncate">{label}</span>
          <span className="text-muted-foreground" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div
            role="listbox"
            aria-label="Work Date"
            className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-full overflow-y-auto rounded-md border border-border bg-surface py-0 shadow-lg"
            style={{ maxHeight: VISIBLE_OPTIONS * OPTION_ROW_PX }}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.label}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex h-7 w-full cursor-pointer items-center px-2.5 text-left text-[12px] hover:bg-surface-alt ${
                    selected ? "bg-surface-alt font-medium text-foreground" : "text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
