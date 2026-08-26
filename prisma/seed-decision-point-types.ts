/**
 * Seed helper: seven FRD Decision Point types (idempotent upsert by code).
 */
import type { DecisionPointAllocationRequirement, PrismaClient } from "@prisma/client";

export const DECISION_POINT_TYPE_SEEDS: Array<{
  code: string;
  name: string;
  description: string;
  allocationRequirement: DecisionPointAllocationRequirement;
}> = [
  {
    code: "dpt-clarification",
    name: "Clarification",
    description: "Need formal clarity on allocated work or direction.",
    allocationRequirement: "optional",
  },
  {
    code: "dpt-concern",
    name: "Concern",
    description: "Formally highlight a concern for managerial visibility.",
    allocationRequirement: "optional",
  },
  {
    code: "dpt-exception",
    name: "Exception Request",
    description: "Request deviation from an existing process, instruction, or expectation.",
    allocationRequirement: "optional",
  },
  {
    code: "dpt-change",
    name: "Change Request",
    description: "Propose a change affecting allocated work.",
    allocationRequirement: "required",
  },
  {
    code: "dpt-dependency",
    name: "Dependency / Blocker",
    description: "Something is preventing or affecting execution.",
    allocationRequirement: "required",
  },
  {
    code: "dpt-decision",
    name: "Decision Required",
    description: "Require a managerial decision on record.",
    allocationRequirement: "optional",
  },
  {
    code: "dpt-approval",
    name: "Approval Required",
    description: "Explicitly require managerial approval.",
    allocationRequirement: "optional",
  },
];

export async function seedDecisionPointTypes(prisma: PrismaClient): Promise<number> {
  for (const row of DECISION_POINT_TYPE_SEEDS) {
    await prisma.decisionPointType.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        description: row.description,
        allocationRequirement: row.allocationRequirement,
      },
      update: {
        name: row.name,
        description: row.description,
        allocationRequirement: row.allocationRequirement,
        isDeleted: false,
        deletedAt: null,
      },
    });
  }
  return DECISION_POINT_TYPE_SEEDS.length;
}
