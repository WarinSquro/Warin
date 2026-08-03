import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";
import { matchesSearchQuery } from "../utils/textSearch";

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
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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
      return;
    }

    triggerRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    updateMenuLayout();
    const focusRaf = window.requestAnimationFrame(() => searchRef.current?.focus());

    const onReposition = () => updateMenuLayout();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.cancelAnimationFrame(focusRaf);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuLayout]);

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

  const menu =
    open && menuLayout
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] flex flex-col rounded-md border border-border bg-surface py-1 shadow-lg"
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
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-soft px-3 py-2">
              <Search className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={`Search ${pluralLabel}…`}
                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visibleItems.length === 0 ? (
                <div className="px-3 py-3 text-[12px] text-muted-foreground">No matches.</div>
              ) : (
                visibleItems.map((item) => {
                const checked = selected.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggle(item)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] hover:bg-surface-alt"
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
        className={`rounded-md border px-3 py-1.5 text-[12px] hover:bg-surface-alt ${
          fullWidth ? "w-full text-left" : ""
        } ${
          noneSelected && !emptyNeutral
            ? "border-danger/40 text-danger"
            : "border-border text-foreground"
        }`}
      >
        {triggerLabel} ▾
      </button>
      {menu}
    </div>
  );
}
