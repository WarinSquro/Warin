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

function resolveHealth(health: ProjectHealth | string | null | undefined): ProjectHealth {
  if (health === "green" || health === "amber" || health === "red") return health;
  return "green";
}

export function ProjectHealthBadge({
  health,
  variant = "dot",
}: {
  health: ProjectHealth | string | null | undefined;
  variant?: "dot" | "bubble";
}) {
  const key = resolveHealth(health);
  if (variant === "bubble") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[10px] font-semibold leading-none ${BUBBLE_STYLES[key]}`}
      >
        {HEALTH_LABELS[key]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLES[key]}`} />
      <span className={`text-[11px] font-medium ${TEXT_STYLES[key]}`}>
        {HEALTH_LABELS[key]}
      </span>
    </span>
  );
}
