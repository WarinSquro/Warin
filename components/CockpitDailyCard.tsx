import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  GitBranch,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

export type CockpitDailyCardVariant = "attention" | "shortage" | "available" | "conflict";

interface CockpitDailyCardProps {
  title: string;
  count: number;
  previewLines: string[];
  zeroLabel: string;
  variant: CockpitDailyCardVariant;
  onClick: () => void;
}

const ICONS: Record<CockpitDailyCardVariant, LucideIcon> = {
  attention: AlertTriangle,
  shortage: UserPlus,
  available: CalendarClock,
  conflict: GitBranch,
};

const ACTIVE: Record<
  CockpitDailyCardVariant,
  { accent: string; card: string; iconBg: string; iconText: string; count: string }
> = {
  attention: {
    accent: "border-l-danger",
    card: "border-danger-border bg-danger-soft/40 hover:border-danger/50",
    iconBg: "bg-danger-soft",
    iconText: "text-danger",
    count: "text-danger",
  },
  shortage: {
    accent: "border-l-warning",
    card: "border-warning-border bg-warning-soft/60 hover:border-warning/50",
    iconBg: "bg-warning-soft",
    iconText: "text-warning",
    count: "text-warning",
  },
  available: {
    accent: "border-l-primary",
    card: "border-accent-line bg-accent-soft/60 hover:border-primary/40",
    iconBg: "bg-accent-soft",
    iconText: "text-primary",
    count: "text-primary",
  },
  conflict: {
    accent: "border-l-danger",
    card: "border-danger-border bg-danger-soft/40 hover:border-danger/50",
    iconBg: "bg-danger-soft",
    iconText: "text-danger",
    count: "text-danger",
  },
};

const CLEAR = {
  accent: "border-l-success",
  card: "border-success-border bg-success-soft/50 hover:border-success/50",
  iconBg: "bg-success-soft",
  iconText: "text-success",
  count: "text-success",
};

export function CockpitDailyCard({
  title,
  count,
  previewLines,
  zeroLabel,
  variant,
  onClick,
}: CockpitDailyCardProps) {
  const isClear = count === 0;
  const style = isClear ? CLEAR : ACTIVE[variant];
  const Icon = ICONS[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full flex-col rounded-lg border border-l-[3px] p-4 text-left shadow-sm transition hover:shadow-md ${style.accent} ${style.card}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${style.iconBg}`}
          >
            <Icon className={`h-4 w-4 ${style.iconText}`} />
          </div>
          <div className="min-w-0 text-[12px] font-medium leading-snug text-foreground">{title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`text-[20px] font-semibold tabular-nums leading-none ${style.count}`}>
            {count}
          </span>
          <ChevronRight
            className={`h-4 w-4 opacity-0 transition group-hover:opacity-100 ${style.iconText}`}
          />
        </div>
      </div>

      {isClear ? (
        <div className={`mt-2 pl-[42px] text-[12px] font-medium ${style.count}`}>{zeroLabel}</div>
      ) : (
        <ul className="mt-2 space-y-1 pl-[42px]">
          {previewLines.slice(0, 2).map((line) => (
            <li key={line} className="truncate text-[12px] text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
