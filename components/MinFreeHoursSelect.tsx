import { useState, useEffect, useRef } from "react";

export function MinFreeHoursSelect({
  options,
  value,
  onChange,
  counts,
  defaultLabel,
  align = "start",
}: {
  options: readonly { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
  counts: Record<number, number>;
  defaultLabel: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const triggerLabel = value === 0 ? defaultLabel : (selected?.label ?? defaultLabel);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const menuAlign = align === "end" ? "right-0" : "left-0";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-3 py-1.5 text-[12px] hover:bg-surface-alt ${
          value === 0 ? "border-border text-foreground" : "border-primary/40 text-foreground"
        }`}
      >
        {triggerLabel} ▾
      </button>
      {open && (
        <div
          className={`absolute ${menuAlign} top-[calc(100%+4px)] z-50 min-w-[200px] rounded-md border border-border bg-surface py-1 shadow-lg`}
        >
            <div className="border-b border-border-soft px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onChange(0);
                  setOpen(false);
                }}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Reset
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {options.map((option) => {
                const checked = value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] hover:bg-surface-alt"
                  >
                    <span
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                        checked ? "border-primary" : "border-border bg-surface"
                      }`}
                    >
                      {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="flex-1 text-foreground">{option.label}</span>
                    <span className="text-[11px] text-muted-foreground">{counts[option.value] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
      )}
    </div>
  );
}
