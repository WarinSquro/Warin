import { FOCUS_CHECK_IN_RESPONSE_SECONDS } from "../utils/focusCheckIn";

export function FocusCheckInModal({
  open,
  secondsLeft,
  onContinue,
}: {
  open: boolean;
  secondsLeft: number;
  onContinue: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-check-in-title"
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-2xl"
      >
        <h2 id="focus-check-in-title" className="text-[15px] font-semibold text-foreground">
          Continue Focused Work?
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Confirm you are still focused. If you do not respond, the focus timer will stop
          automatically.
        </p>
        <div className="mt-3 text-center font-mono text-[22px] font-semibold tabular-nums text-warning">
          {secondsLeft}s
        </div>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Auto-stop in {FOCUS_CHECK_IN_RESPONSE_SECONDS}s without a response
        </p>
        <button
          type="button"
          autoFocus
          onClick={onContinue}
          className="mt-4 w-full cursor-pointer rounded-md bg-primary px-3 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
        >
          Continue Focused Work
        </button>
      </div>
    </div>
  );
}
