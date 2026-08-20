import type { SettingsState } from "../data/settings";

export type ReviewSection = "utilization" | "planning" | "capacity" | "overallocation";

export type ReviewCommittedSnapshot = {
  bands: SettingsState["bands"];
  metricBands: SettingsState["metricBands"];
  capacityBasis: SettingsState["capacityBasis"];
  overallocationLimit: number;
};

function bandsDirty(current: SettingsState, committed: ReviewCommittedSnapshot): boolean {
  return (
    current.bands.idleBelow !== committed.bands.idleBelow ||
    current.bands.optimalTo !== committed.bands.optimalTo
  );
}

function metricBandsDirty(current: SettingsState, committed: ReviewCommittedSnapshot): boolean {
  return (
    current.metricBands.excellent !== committed.metricBands.excellent ||
    current.metricBands.good !== committed.metricBands.good ||
    current.metricBands.needsAttention !== committed.metricBands.needsAttention
  );
}

/** Patch that restores one Review & Save card to its last saved snapshot. */
export function restoreReviewSectionPatch(
  section: ReviewSection,
  committed: ReviewCommittedSnapshot
): Partial<SettingsState> {
  switch (section) {
    case "utilization":
      return { bands: { ...committed.bands } };
    case "planning":
      return { metricBands: { ...committed.metricBands } };
    case "capacity":
      return { capacityBasis: committed.capacityBasis };
    case "overallocation":
      return { overallocationLimit: committed.overallocationLimit };
  }
}

/** Patch that restores every unsaved Review & Save card to its last saved snapshot. */
export function restoreAllReviewDraftsPatch(
  current: SettingsState,
  committed: ReviewCommittedSnapshot
): Partial<SettingsState> | null {
  const restore: Partial<SettingsState> = {};
  if (bandsDirty(current, committed)) restore.bands = { ...committed.bands };
  if (metricBandsDirty(current, committed)) restore.metricBands = { ...committed.metricBands };
  if (current.capacityBasis !== committed.capacityBasis) {
    restore.capacityBasis = committed.capacityBasis;
  }
  if (current.overallocationLimit !== committed.overallocationLimit) {
    restore.overallocationLimit = committed.overallocationLimit;
  }
  return Object.keys(restore).length ? restore : null;
}
