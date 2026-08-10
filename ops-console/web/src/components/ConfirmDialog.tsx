import { useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-xl">
        <div className="text-[16px] font-semibold text-brand">{title}</div>
        <div className="mt-2 text-[13px] text-muted">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    message: ReactNode;
    danger?: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = (opts: { title: string; message: ReactNode; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...opts, resolve }));

  const dialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title || ""}
      message={state?.message}
      danger={state?.danger}
      onCancel={() => {
        state?.resolve(false);
        setState(null);
      }}
      onConfirm={() => {
        state?.resolve(true);
        setState(null);
      }}
    />
  );

  return { confirm, dialog };
}
