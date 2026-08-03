import type { ProjectType } from "../data/projects";

const TYPE_CONFIG: Record<ProjectType, { label: string; className: string }> = {
  paid: {
    label: "Paid",
    className: "bg-success-soft text-success-fg",
  },
  poc: {
    label: "POC",
    className: "bg-warning-soft text-warning",
  },
  product: {
    label: "Product",
    className: "bg-accent-soft text-accent-softfg",
  },
};

export function ProjectTypeBadge({ type }: { type: ProjectType }) {
  const config = TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
