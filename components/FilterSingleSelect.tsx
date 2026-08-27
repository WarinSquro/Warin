import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { matchesSearchQuery } from "../utils/textSearch";
import { nextEnabledIndex } from "../utils/dropdownListNav";
import { DropdownMenuSearch } from "./DropdownMenuSearch";

export type FilterSingleSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type MenuLayout = {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxHeight: number;
};

/**
 * Single-select dropdown chrome matching FilterMultiSelect (portal menu, flip above/below).
 * Type-to-search + keyboard list nav (↓/↑ highlight, Enter select) while focus stays in search.
 */
export function FilterSingleSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  align = "start",
  fullWidth = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterSingleSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  align?: "start" | "end";
  fullWidth?: boolean;
  className?: string;
  "aria-label"?: string;
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

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder;
  const isPlaceholder = !selected;

  const visibleOptions = useMemo(
    () => options.filter((o) => matchesSearchQuery(menuQuery, o.label, o.value)),
    [options, menuQuery]
  );

  const isOptDisabled = useCallback((o: FilterSingleSelectOption) => Boolean(o.disabled), []);

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

  /** Focus search after the portal menu mounts (layout ready) so type-to-search works on open. */
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

  const selectOption = (opt: FilterSingleSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
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
      setHighlightIndex((i) => nextEnabledIndex(visibleOptions, i, 1, isOptDisabled));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => nextEnabledIndex(visibleOptions, i, -1, isOptDisabled));
      return;
    }
    if (e.key === "Enter") {
      if (highlightIndex < 0 || highlightIndex >= visibleOptions.length) return;
      e.preventDefault();
      const opt = visibleOptions[highlightIndex];
      if (opt) selectOption(opt);
    }
  };

  const menu =
    open && menuLayout
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed z-[100] flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            style={{
              top: menuLayout.top,
              bottom: menuLayout.bottom,
              left: menuLayout.left,
              minWidth: menuLayout.minWidth,
              maxHeight: menuLayout.maxHeight,
            }}
          >
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
                visibleOptions.map((opt, index) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = index === highlightIndex;
                  return (
                    <button
                      key={opt.value === "" ? "__empty__" : opt.value}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onMouseEnter={() => {
                        if (!opt.disabled) setHighlightIndex(index);
                      }}
                      onClick={() => selectOption(opt)}
                      className={`flex w-full cursor-pointer items-center px-3 py-2 text-left text-[12px] disabled:cursor-not-allowed disabled:opacity-50 ${
                        isHighlighted
                          ? "bg-surface-alt text-foreground"
                          : isSelected
                            ? "bg-primary/5 font-medium text-primary"
                            : "text-foreground hover:bg-surface-alt"
                      }`}
                    >
                      {opt.label}
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
    <div ref={rootRef} className={`relative ${fullWidth ? "w-full" : ""} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={`inline-flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        <span className={`truncate ${isPlaceholder ? "text-muted-foreground" : ""}`}>{displayLabel}</span>
        <span className="text-[10px] text-muted-foreground">▾</span>
      </button>
      {menu}
    </div>
  );
}
