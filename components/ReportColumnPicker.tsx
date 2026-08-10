import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Columns3 } from "lucide-react";

export interface ReportColumnOption {
  id: string;
  label: string;
  defaultVisible: boolean;
  /** Shown checked and not toggleable (e.g. ACTION). */
  locked?: boolean;
}

interface ReportColumnPickerProps {
  columns: ReportColumnOption[];
  visible: Set<string>;
  onChange: (visible: Set<string>) => void;
  onReset: () => void;
  /** When true, all unlocked columns may be unchecked. */
  allowEmpty?: boolean;
}

export function ReportColumnPicker({
  columns,
  visible,
  onChange,
  onReset,
  allowEmpty = false,
}: ReportColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<{ top: number; left: number; minWidth: number } | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const lockedIds = useMemo(
    () => new Set(columns.filter((c) => c.locked).map((c) => c.id)),
    [columns]
  );

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const minWidth = 220;
    let left = rect.right - minWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - minWidth - 8));
    setMenuLayout({ top: rect.bottom + 4, left, minWidth });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }
    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);
    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
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

  const toggle = (id: string) => {
    if (lockedIds.has(id)) return;
    const next = new Set(visible);
    if (next.has(id)) {
      const unlockedVisible = [...next].filter((x) => !lockedIds.has(x));
      if (!allowEmpty && unlockedVisible.length <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    for (const locked of lockedIds) next.add(locked);
    onChange(next);
  };

  const menu =
    open && menuLayout
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] max-h-[360px] overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
            style={{
              top: menuLayout.top,
              left: menuLayout.left,
              minWidth: menuLayout.minWidth,
            }}
          >
            <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
              <span className="text-[11px] font-medium text-foreground">Show columns</span>
              <button
                type="button"
                onClick={onReset}
                className="text-[11px] text-primary hover:underline"
              >
                Reset
              </button>
            </div>
            {columns.map((col) => {
              const checked = visible.has(col.id) || !!col.locked;
              const locked = !!col.locked;
              return (
                <button
                  key={col.id}
                  type="button"
                  disabled={locked}
                  onClick={() => toggle(col.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] ${
                    locked ? "cursor-not-allowed opacity-55" : "hover:bg-surface-alt"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                      checked ? "border-primary bg-primary text-white" : "border-border bg-surface"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="text-foreground">{col.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
      </button>
      {menu}
    </div>
  );
}
