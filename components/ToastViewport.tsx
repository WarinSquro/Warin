import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import type { ToastTone } from "./ToastViewport.types";

export type { ToastTone } from "./ToastViewport.types";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  message: string;
};

const TONE_STYLE: Record<
  ToastTone,
  { wrap: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    wrap: "border-success-border bg-success-soft text-success-fg",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  info: {
    wrap: "border-accent-line bg-accent-soft text-accent-softfg",
    icon: "text-primary",
    Icon: Info,
  },
  warning: {
    wrap: "border-warning-border bg-warning-soft text-warning",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
  error: {
    wrap: "border-danger-border bg-danger-soft text-danger",
    icon: "text-danger",
    Icon: XCircle,
  },
};

export function ToastViewport({
  items,
  onDismiss,
  onPause,
  onResume,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col-reverse gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((item) => {
        const style = TONE_STYLE[item.tone];
        const Icon = style.Icon;
        return (
          <div
            key={item.id}
            role="status"
            onMouseEnter={() => onPause(item.id)}
            onMouseLeave={() => onResume(item.id)}
            className={`toast-enter pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg ${style.wrap}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${style.icon}`} aria-hidden />
            <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{item.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="flex-shrink-0 rounded p-0.5 text-current opacity-60 hover:opacity-100"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
