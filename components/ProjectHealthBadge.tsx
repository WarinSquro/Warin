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

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLES[health]}`} />
      <span className={`text-[11px] font-medium ${TEXT_STYLES[health]}`}>
        {HEALTH_LABELS[health]}
      </span>
    </span>
  );
}
