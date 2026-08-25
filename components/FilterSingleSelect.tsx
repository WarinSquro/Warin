import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

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
 * App-wide single-select — same trigger chrome as FilterMultiSelect
 * (`rounded-md border … text-[12px]` button, label left / `▾` right with equal `px-3` inset + panel menu). Prefer this over native `<select>`.
 */
export function FilterSingleSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  fullWidth = false,
  "aria-label": ariaLabel,
  align = "start",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterSingleSelectOption[];
  /** Shown when value is "" or not in options (and no option with value ""). */
  placeholder?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  "aria-label"?: string;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const emptyOption = options.find((o) => o.value === "");
  const selected = options.find((o) => o.value === value);
  const triggerLabel =
    selected?.label ?? emptyOption?.label ?? (value ? value : placeholder);

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const menuMinWidth = Math.max(fullWidth ? rect.width : 200, rect.width);
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
  }, [align, fullWidth]);

  useEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }
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

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const menu =
    open && menuLayout && !disabled
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            className="fixed z-[100] overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
            style={{
              top: menuLayout.top,
              bottom: menuLayout.bottom,
              left: menuLayout.left,
              minWidth: menuLayout.minWidth,
              maxHeight: menuLayout.maxHeight,
            }}
          >
            {options.map((option) => {
              const checked = value === option.value;
              return (
                <button
                  key={option.value || "__empty__"}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer px-3 py-2 text-left text-[12px] hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${
                    checked ? "font-medium text-foreground" : "text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""} ${className}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`inline-flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${
          fullWidth ? "w-full" : ""
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
