import type { RankingLevel } from "../data/weeklyCheckIn";
import { rankingChipClass } from "../data/weeklyCheckIn";

interface CompetencyRankingLegendProps {
  rankingLevels: RankingLevel[];
  className?: string;
}

export function CompetencyRankingLegend({
  rankingLevels,
  className = "",
}: CompetencyRankingLegendProps) {
  const sorted = [...rankingLevels].sort((a, b) => b.value - a.value);

  return (
    <div
      className={`flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto ${className}`}
      aria-label="Ranking legend"
    >
      {sorted.map((level) => (
        <span
          key={level.value}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${rankingChipClass(level, true)}`}
          title={level.title}
        >
          <span className="tabular-nums">{level.value}</span>
          <span>{level.title}</span>
        </span>
      ))}
    </div>
  );
}
