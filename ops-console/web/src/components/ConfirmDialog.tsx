import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="ops-confirm-title" className="text-[16px] font-semibold text-brand">
          {title}
        </div>
        <div className="mt-2 text-[13px] text-muted">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost cursor-pointer" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn cursor-pointer ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const [state, setState] = useState<{
    title: string;
    message: ReactNode;
    danger?: boolean;
    confirmLabel?: string;
  } | null>(null);

  const close = useCallback((value: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback(
    (opts: {
      title: string;
      message: ReactNode;
      danger?: boolean;
      confirmLabel?: string;
    }) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setState(opts);
      }),
    [],
  );

  const dialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title || ""}
      message={state?.message}
      danger={state?.danger}
      confirmLabel={state?.confirmLabel}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );

  return { confirm, dialog, close };
}
