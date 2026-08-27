import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import { matchesSearchQuery } from "../utils/textSearch";
import { nextEnabledIndex } from "../utils/dropdownListNav";
import { DropdownMenuSearch } from "./DropdownMenuSearch";

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
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.find((o) => o.value === value);
  const triggerLabel = value === 0 ? defaultLabel : (selected?.label ?? defaultLabel);

  const visibleOptions = useMemo(
    () => options.filter((o) => matchesSearchQuery(menuQuery, o.label, String(o.value))),
    [options, menuQuery]
  );

  useEffect(() => {
    if (!open) {
      setMenuQuery("");
      setHighlightIndex(-1);
      return;
    }
    const focusRaf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => searchRef.current?.focus());
    });
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

  useEffect(() => {
    setHighlightIndex(-1);
  }, [menuQuery]);

  useEffect(() => {
    if (highlightIndex < 0) return;
    optionRefs.current[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const selectOption = (option: { value: number; label: string }) => {
    onChange(option.value);
    setOpen(false);
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => nextEnabledIndex(visibleOptions, i, 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => nextEnabledIndex(visibleOptions, i, -1));
      return;
    }
    if (e.key === "Enter" && highlightIndex >= 0) {
      const opt = visibleOptions[highlightIndex];
      if (!opt) return;
      e.preventDefault();
      selectOption(opt);
    }
  };

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
          <DropdownMenuSearch
            inputRef={searchRef}
            value={menuQuery}
            onChange={setMenuQuery}
            onKeyDown={onSearchKeyDown}
            placeholder="Type to search…"
            aria-label="Search options"
          />
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground">No matches.</div>
            ) : (
              visibleOptions.map((option, index) => {
                const checked = value === option.value;
                const isHighlighted = index === highlightIndex;
                return (
                  <button
                    key={option.value}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    type="button"
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[12px] ${
                      isHighlighted ? "bg-surface-alt" : "hover:bg-surface-alt"
                    }`}
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
