import { describe, expect, it } from "vitest";
import type { ProjectType } from "../../data/projects";
import { projectTypeBadgeConfig } from "../../components/ProjectTypeBadge";

const ALL_TYPES: ProjectType[] = ["paid", "poc", "product", "support"];

describe("projectTypeBadgeConfig", () => {
  it("covers every ProjectType so Execution Report cannot crash on config.className", () => {
    for (const type of ALL_TYPES) {
      const config = projectTypeBadgeConfig(type);
      expect(config.label).toBeTruthy();
      expect(config.className).toBeTruthy();
    }
  });

  it("does not throw for unknown or empty type", () => {
    expect(projectTypeBadgeConfig("support").label).toBe("Support");
    expect(projectTypeBadgeConfig("unknown-type").className).toBeTruthy();
    expect(projectTypeBadgeConfig(undefined).label).toBe("—");
    expect(projectTypeBadgeConfig(null).label).toBe("—");
  });
});
