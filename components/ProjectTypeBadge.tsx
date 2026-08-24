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
  support: {
    label: "Support",
    className: "bg-surface-alt text-foreground",
  },
};

const FALLBACK = {
  label: "—",
  className: "bg-surface-alt text-muted-foreground",
};

/** Safe lookup — unknown API values must not crash report screens. */
export function projectTypeBadgeConfig(type: string | null | undefined) {
  if (type && type in TYPE_CONFIG) {
    return TYPE_CONFIG[type as ProjectType];
  }
  return type
    ? { label: type, className: FALLBACK.className }
    : FALLBACK;
}

export function ProjectTypeBadge({ type }: { type: ProjectType | string | null | undefined }) {
  const config = projectTypeBadgeConfig(type);
  return (
    <span
      className={`inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
