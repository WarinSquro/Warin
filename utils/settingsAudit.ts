// System Parameters change history — durable via API / Postgres (FR-616).
import type { CompanyOffDay, SettingsState } from "../data/settings";

export interface SettingsAuditEntry {
  id: string;
  who: string;
  what: string;
  when: string;
}

export function formatAuditWhen(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function offDaySetLabel(days: CompanyOffDay[]): Map<string, string> {
  return new Map(days.map((d) => [d.date, d.label]));
}

/** Builds a human-readable list of what changed between two settings snapshots. */
export function describeSettingsChanges(prev: SettingsState, next: SettingsState): string[] {
  const changes: string[] = [];

  if (prev.bands.idleBelow !== next.bands.idleBelow) {
    changes.push(`Idle below ${prev.bands.idleBelow}% → ${next.bands.idleBelow}%`);
  }
  if (prev.bands.optimalTo !== next.bands.optimalTo) {
    changes.push(`Optimal up to ${prev.bands.optimalTo}% → ${next.bands.optimalTo}%`);
  }
  if (prev.metricBands.excellent !== next.metricBands.excellent) {
    changes.push(`Excellent from ${prev.metricBands.excellent}% → ${next.metricBands.excellent}%`);
  }
  if (prev.metricBands.good !== next.metricBands.good) {
    changes.push(`Good from ${prev.metricBands.good}% → ${next.metricBands.good}%`);
  }
  if (prev.metricBands.needsAttention !== next.metricBands.needsAttention) {
    changes.push(`Needs attention from ${prev.metricBands.needsAttention}% → ${next.metricBands.needsAttention}%`);
  }
  if (prev.capacityBasis !== next.capacityBasis) {
    changes.push(`Capacity basis ${prev.capacityBasis} → ${next.capacityBasis}`);
  }
  if (prev.overallocationLimit !== next.overallocationLimit) {
    changes.push(`Overallocation limit ${prev.overallocationLimit}% → ${next.overallocationLimit}%`);
  }
  if (prev.workingHoursPerDay !== next.workingHoursPerDay) {
    changes.push(`Hours per day ${prev.workingHoursPerDay}h → ${next.workingHoursPerDay}h`);
  }
  if (prev.workingDays.join(",") !== next.workingDays.join(",")) {
    changes.push(`Working days ${prev.workingDays.join(", ")} → ${next.workingDays.join(", ")}`);
  }

  const prevOff = offDaySetLabel(prev.companyOffDays);
  const nextOff = offDaySetLabel(next.companyOffDays);
  for (const [date, label] of nextOff) {
    if (!prevOff.has(date)) changes.push(`Added off day: ${label} (${date})`);
  }
  for (const [date, label] of prevOff) {
    if (!nextOff.has(date)) changes.push(`Removed off day: ${label} (${date})`);
  }

  return changes;
}
