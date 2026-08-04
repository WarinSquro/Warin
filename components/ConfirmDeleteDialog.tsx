import { Trash2 } from "lucide-react";

/**
 * Standard delete confirmation — title/message per product UX.
 * Caller must only run the delete after onConfirm.
 */
export function ConfirmDeleteDialog({
  open,
  onCancel,
  onConfirm,
  confirming = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/50" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-desc"
        className="relative z-10 w-full max-w-[360px] rounded-xl bg-surface p-5 text-center shadow-2xl"
      >
        <div className="flex justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft">
            <Trash2 className="h-5 w-5 text-danger" />
          </div>
        </div>
        <div id="confirm-delete-title" className="mt-3 text-[15px] font-semibold text-foreground">
          Confirm Delete
        </div>
        <div id="confirm-delete-desc" className="mt-1.5 text-[13px] text-muted-foreground">
          Are you sure you want to delete this Record?
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 rounded-md bg-danger py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {confirming ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
