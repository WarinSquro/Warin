import type { ProjectHealth } from "../data/executionReport";
import { HEALTH_LABELS } from "../data/executionReport";

const DOT_STYLES: Record<ProjectHealth, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-danger",
};

const TEXT_STYLES: Record<ProjectHealth, string> = {
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
};

const BUBBLE_STYLES: Record<ProjectHealth, string> = {
  green: "bg-success-soft text-success-fg",
  amber: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
};

export function ProjectHealthBadge({
  health,
  variant = "dot",
}: {
  health: ProjectHealth;
  variant?: "dot" | "bubble";
}) {
  if (variant === "bubble") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[10px] font-semibold leading-none ${BUBBLE_STYLES[health]}`}
      >
        {HEALTH_LABELS[health]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLES[health]}`} />
      <span className={`text-[11px] font-medium ${TEXT_STYLES[health]}`}>
        {HEALTH_LABELS[health]}
      </span>
    </span>
  );
}
