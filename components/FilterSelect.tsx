import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FilterSelectOption = {
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
 * Single-select dropdown matching Warin filter / form chrome.
 * Menu is portaled to document.body so it is not clipped by overflow parents
 * (e.g. KPI Framework table `overflow-hidden` / `overflow-x-auto`).
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
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const menuMinWidth = Math.max(rect.width, 120);
    const maxMenuHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(maxMenuHeight, Math.max(96, available - 8));

    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuMinWidth - 8));

    setMenuLayout({
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      left,
      minWidth: menuMinWidth,
      maxHeight,
    });
  }, []);

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

  const menu =
    open && !disabled && menuLayout
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            className={`fixed z-[100] overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg ${menuClassName}`}
            style={{
              top: menuLayout.top,
              bottom: menuLayout.bottom,
              left: menuLayout.left,
              minWidth: menuLayout.minWidth,
              maxHeight: menuLayout.maxHeight,
            }}
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
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative min-w-0 ${className}`} ref={rootRef}>
      <button
        ref={triggerRef}
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
      {menu}
    </div>
  );
}
