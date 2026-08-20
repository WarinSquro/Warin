import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../data/settings";
import type { SettingsState } from "../../data/settings";
import {
  restoreAllReviewDraftsPatch,
  restoreReviewSectionPatch,
  type ReviewCommittedSnapshot,
} from "../../utils/settingsReviewDraft";

function committed(overrides: Partial<ReviewCommittedSnapshot> = {}): ReviewCommittedSnapshot {
  return {
    bands: { ...DEFAULT_SETTINGS.bands },
    metricBands: { ...DEFAULT_SETTINGS.metricBands },
    capacityBasis: DEFAULT_SETTINGS.capacityBasis,
    overallocationLimit: DEFAULT_SETTINGS.overallocationLimit,
    ...overrides,
  };
}

function settings(overrides: Partial<SettingsState> = {}): SettingsState {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("settingsReviewDraft", () => {
  it("restores only the section cancelled in Review & Save", () => {
    const base = committed({ bands: { idleBelow: 70, optimalTo: 100 } });
    const patch = restoreReviewSectionPatch("utilization", base);
    expect(patch).toEqual({ bands: { idleBelow: 70, optimalTo: 100 } });
  });

  it("restores all unsaved review cards when leaving System Parameters", () => {
    const base = committed({
      bands: { idleBelow: 70, optimalTo: 100 },
      metricBands: { excellent: 100, good: 90, needsAttention: 75 },
      capacityBasis: "billable",
      overallocationLimit: 120,
    });
    const dirty = settings({
      bands: { idleBelow: 85, optimalTo: 95 },
      metricBands: { excellent: 100, good: 85, needsAttention: 75 },
      capacityBasis: "total",
      overallocationLimit: 130,
    });
    expect(restoreAllReviewDraftsPatch(dirty, base)).toEqual({
      bands: { idleBelow: 70, optimalTo: 100 },
      metricBands: { excellent: 100, good: 90, needsAttention: 75 },
      capacityBasis: "billable",
      overallocationLimit: 120,
    });
  });

  it("returns null when review fields already match committed values", () => {
    const base = committed();
    expect(restoreAllReviewDraftsPatch(settings(), base)).toBeNull();
  });
});
