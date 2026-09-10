import { describe, expect, it } from "vitest";
import {
  findFirstSubmissionIssue,
  getCompetenciesForDepartment,
  MIN_RO_REMARKS_LENGTH,
  type WeeklyCheckInDraft,
} from "../../data/weeklyCheckIn";

const DEPT_KEY = "dept-1";

function ratedDraft(roRemarks: string): WeeklyCheckInDraft {
  const comps = getCompetenciesForDepartment(DEPT_KEY);
  const technicalRatings: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  const behaviouralRatings: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  for (const c of comps) {
    if (c.kind === "technical") technicalRatings[c.id] = 3;
    else behaviouralRatings[c.id] = 3;
  }
  return {
    employeeId: "EMP-1043",
    resourceOwnerId: "EMP-1042",
    weekStart: "2026-09-01",
    technicalRatings,
    behaviouralRatings,
    weeklyStatus: "On Track",
    confidence: "Medium",
    roRemarks,
    actionType: "None",
    actionNotes: "",
    recognition: "None",
  };
}

describe("RO Remarks min length (no max)", () => {
  it("rejects remarks shorter than minimum", () => {
    const issue = findFirstSubmissionIssue(
      ratedDraft("too short"),
      undefined,
      DEPT_KEY
    );
    expect(issue?.message).toBe(
      `RO Remarks must be at least ${MIN_RO_REMARKS_LENGTH} characters.`
    );
    expect(issue?.focusId).toBe("wci-focus-ro-remarks");
  });

  it("rejects empty / whitespace remarks", () => {
    const issue = findFirstSubmissionIssue(ratedDraft("   "), undefined, DEPT_KEY);
    expect(issue?.message).toMatch(/at least 100/i);
  });

  it("accepts remarks at minimum length", () => {
    const issue = findFirstSubmissionIssue(
      ratedDraft("x".repeat(MIN_RO_REMARKS_LENGTH)),
      undefined,
      DEPT_KEY
    );
    expect(issue).toBeNull();
  });

  it("accepts remarks longer than 100 characters", () => {
    const issue = findFirstSubmissionIssue(
      ratedDraft("x".repeat(250)),
      undefined,
      DEPT_KEY
    );
    expect(issue).toBeNull();
  });
});
