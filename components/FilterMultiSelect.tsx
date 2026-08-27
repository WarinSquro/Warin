import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { matchesSearchQuery } from "../utils/textSearch";
import { nextEnabledIndex } from "../utils/dropdownListNav";
import { DropdownMenuSearch } from "./DropdownMenuSearch";

type MenuLayout = {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxHeight: number;
};

export function FilterMultiSelect({
  items,
  selected,
  onChange,
  counts,
  allLabel,
  pluralLabel,
  align = "start",
  emptyNeutral = false,
  fullWidth = false,
}: {
  items: readonly string[];
  selected: string[];
  onChange: (items: string[]) => void;
  counts: Record<string, number>;
  allLabel: string;
  pluralLabel: string;
  align?: "start" | "end";
  /** When true, empty selection uses neutral styling (not error). */
  emptyNeutral?: boolean;
  /** Stretch trigger to container width. */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const allSelected = selected.length === items.length;
  const noneSelected = selected.length === 0;
  const visibleItems = useMemo(
    () => items.filter((item) => matchesSearchQuery(menuQuery, item)),
    [items, menuQuery]
  );

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const menuMinWidth = Math.max(200, rect.width);
    const maxMenuHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(maxMenuHeight, Math.max(120, available - 8));

    let left = align === "end" ? rect.right - menuMinWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuMinWidth - 8));

    setMenuLayout({
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      left,
      minWidth: menuMinWidth,
      maxHeight,
    });
  }, [align]);

  useEffect(() => {
    if (!open) {
      setMenuLayout(null);
      setMenuQuery("");
      setHighlightIndex(-1);
      return;
    }

    triggerRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    updateMenuLayout();

    const onReposition = () => updateMenuLayout();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuLayout]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [menuQuery]);

  useEffect(() => {
    if (highlightIndex < 0) return;
    optionRefs.current[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  /** Focus search after the portal menu mounts so type-to-search works on open. */
  useEffect(() => {
    if (!open || !menuLayout) return;
    const focusRaf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => searchRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(focusRaf);
  }, [open, menuLayout]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const triggerLabel =
    noneSelected && emptyNeutral
      ? allLabel
      : allSelected
        ? allLabel
        : selected.length === 1
          ? selected[0]
          : `${selected.length} ${pluralLabel}`;

  const toggle = (item: string) => {
    onChange(
      selected.includes(item)
        ? selected.filter((d) => d !== item)
        : [...selected, item].sort((a, b) => a.localeCompare(b))
    );
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => nextEnabledIndex(visibleItems, i, 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => nextEnabledIndex(visibleItems, i, -1));
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && highlightIndex >= 0) {
      const item = visibleItems[highlightIndex];
      if (!item) return;
      e.preventDefault();
      toggle(item);
    }
  };

  const menu =
    open && menuLayout
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            style={{
              top: menuLayout.top,
              bottom: menuLayout.bottom,
              left: menuLayout.left,
              minWidth: menuLayout.minWidth,
              maxHeight: menuLayout.maxHeight,
            }}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-3 py-2">
              <button
                type="button"
                onClick={() => onChange([...items])}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
            <DropdownMenuSearch
              inputRef={searchRef}
              value={menuQuery}
              onChange={setMenuQuery}
              onKeyDown={onSearchKeyDown}
              placeholder={`Search ${pluralLabel}…`}
              aria-label={`Search ${pluralLabel}`}
            />
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {visibleItems.length === 0 ? (
                <div className="px-3 py-3 text-[12px] text-muted-foreground">No matches.</div>
              ) : (
                visibleItems.map((item, index) => {
                  const checked = selected.includes(item);
                  const isHighlighted = index === highlightIndex;
                  return (
                    <button
                      key={item}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      type="button"
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => toggle(item)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] ${
                        isHighlighted ? "bg-surface-alt" : "hover:bg-surface-alt"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                          checked ? "border-primary bg-primary text-white" : "border-border bg-surface"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 text-foreground">{item}</span>
                      <span className="text-[11px] text-muted-foreground">{counts[item] ?? 0}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-[12px] hover:bg-surface-alt ${
          fullWidth ? "w-full" : ""
        } ${
          noneSelected && !emptyNeutral
            ? "border-danger/40 text-danger"
            : "border-border text-foreground"
        }`}
      >
        <span className="min-w-0 truncate text-left">{triggerLabel}</span>
        <span className="shrink-0 leading-none" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
