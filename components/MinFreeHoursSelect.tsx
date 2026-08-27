import { useState, useEffect, useRef, useMemo } from "react";
import { Search } from "lucide-react";
import { matchesSearchQuery } from "../utils/textSearch";

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
  const [menuQuery, setMenuQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const triggerLabel = value === 0 ? defaultLabel : (selected?.label ?? defaultLabel);

  const visibleOptions = useMemo(
    () => options.filter((o) => matchesSearchQuery(menuQuery, o.label, String(o.value))),
    [options, menuQuery]
  );

  useEffect(() => {
    if (!open) {
      setMenuQuery("");
      return;
    }
    const focusRaf = window.requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.cancelAnimationFrame(focusRaf);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const menuAlign = align === "end" ? "right-0" : "left-0";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-[12px] hover:bg-surface-alt ${
          value === 0 ? "border-border text-foreground" : "border-primary/40 text-foreground"
        }`}
      >
        <span className="min-w-0 truncate text-left">{triggerLabel}</span>
        <span className="shrink-0 leading-none" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className={`absolute ${menuAlign} top-[calc(100%+4px)] z-50 flex max-h-[360px] min-w-[200px] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg`}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-3 py-2">
            <button
              type="button"
              onClick={() => {
                onChange(0);
                setOpen(false);
              }}
              className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
            >
              Reset
            </button>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-soft px-3 py-2">
            <Search className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Type to search…"
              aria-label="Search options"
              className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground">No matches.</div>
            ) : (
              visibleOptions.map((option) => {
                const checked = value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[12px] hover:bg-surface-alt"
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
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
