import { describe, expect, it } from "vitest";
import { matchesSearchQuery } from "../../utils/textSearch";
import { projectVisibleSearchFields } from "../../utils/projectVisibleSearch";
import type { Project } from "../../data/projects";

const formatDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "—");
const formatDateTime = (value: string | Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? "";

function sample(over: Partial<Project> = {}): Project {
  return {
    id: "HIDDEN-ID",
    name: "Alpha Build",
    customer: "Northwind Inc.",
    poNumber: "PO-99",
    type: "paid",
    kickoffDate: "2026-01-15",
    startDate: "2026-01-20",
    endDate: "2026-06-30",
    milestones: [{ id: "m1", name: "UAT Sign-off", date: "2026-03-01" }],
    demand: "2× React",
    health: "amber",
    status: "active",
    createdAt: "2026-01-10T10:00:00.000Z",
    modifiedAt: "2026-01-11T10:00:00.000Z",
    createdByName: "Ada Lovelace",
    modifiedByName: "Bob Martin",
    ...over,
  };
}

function matches(q: string, p: Project, visible: string[]) {
  return matchesSearchQuery(q, ...projectVisibleSearchFields(p, new Set(visible), formatDate, formatDateTime));
}

describe("projectVisibleSearchFields", () => {
  it("matches project column display text when that column is visible", () => {
    const p = sample();
    const visible = ["project"];
    expect(matches("Alpha", p, visible)).toBe(true);
    expect(matches("Northwind", p, visible)).toBe(true);
    expect(matches("PO-99", p, visible)).toBe(true);
    expect(matches("PAID", p, visible)).toBe(true);
  });

  it("does not match hidden-column values or project id", () => {
    const p = sample();
    const visible = ["project"];
    expect(matches("HIDDEN-ID", p, visible)).toBe(false);
    expect(matches("UAT Sign-off", p, visible)).toBe(false);
    expect(matches("Needs Attention", p, visible)).toBe(false);
    expect(matches("Ada Lovelace", p, visible)).toBe(false);
  });

  it("matches health and audit columns only when they are visible", () => {
    const p = sample();
    expect(matches("Needs Attention", p, ["health"])).toBe(true);
    expect(matches("Needs Attention", p, ["project"])).toBe(false);
    expect(matches("Ada", p, ["createdBy"])).toBe(true);
    expect(matches("Ada", p, ["modifiedBy"])).toBe(false);
  });

  it("does not search the Action column", () => {
    const p = sample();
    expect(matches("Disable", p, ["action", "project"])).toBe(false);
  });
});
