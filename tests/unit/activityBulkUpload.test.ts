import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  interpretActivityType,
  parseBillableFlag,
  parseMilestoneKind,
  parseProjectType,
} from "../../utils/activityBulkUpload";

describe("parseMilestoneKind", () => {
  it("maps Excel labels", () => {
    expect(parseMilestoneKind("Commercial Only")).toBe("commercial_only");
    expect(parseMilestoneKind("Commercial")).toBe("commercial_only");
    expect(parseMilestoneKind("Commercial & Sign-off")).toBe("commercial_signoff");
    expect(parseMilestoneKind("Checkpoint Only")).toBe("checkpoint_only");
    expect(parseMilestoneKind("Sign-off Only")).toBe("signoff_only");
    expect(parseMilestoneKind("Sign-off")).toBe("signoff_only");
    expect(parseMilestoneKind("Checkpoint")).toBe("checkpoint_only");
    expect(parseMilestoneKind("Sign-off & Commercial")).toBe("commercial_signoff");
  });
});

describe("parseProjectType", () => {
  it("maps Paid / POC / Product", () => {
    expect(parseProjectType("Paid")).toBe("paid");
    expect(parseProjectType("POC")).toBe("poc");
    expect(parseProjectType("Product")).toBe("product");
  });
});

describe("parseBillableFlag", () => {
  it("maps Type column values", () => {
    expect(parseBillableFlag("Billable")).toBe(true);
    expect(parseBillableFlag("Internal (Non-billable)")).toBe(false);
    expect(parseBillableFlag("Internal")).toBe(false);
  });
});

describe("interpretActivityType", () => {
  it("uses Activity Type for project type and defaults billable when Type is empty", () => {
    expect(interpretActivityType("Paid", "", "")).toEqual({ projectType: "paid", billable: true });
  });

  it("reads billable flag from Type column", () => {
    expect(interpretActivityType("Paid", "Billable", "")).toEqual({
      projectType: "paid",
      billable: true,
    });
    expect(interpretActivityType("Paid", "Internal (Non-billable)", "")).toEqual({
      projectType: "paid",
      billable: false,
    });
  });

  it("rejects unknown Type values", () => {
    expect(interpretActivityType("Paid", "Unknown", "")).toEqual({
      projectType: "paid",
      billable: true,
      error: 'Type "Unknown" must be Billable or Internal (Non-billable)',
    });
  });
});

describe("Warin-Activity-Upload.xlsx shape", () => {
  it("parses user workbook headers and Type values", () => {
    const wb = XLSX.readFile("D:/Users/AMIT/Downloads/Warin-Activity-Upload.xlsx");
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const records = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    expect(records.length).toBeGreaterThan(0);
    const headers = Object.keys(records[0]!).filter((k) => !k.startsWith("__EMPTY"));
    expect(headers).toEqual([
      "Milestone",
      "Milestone Type",
      "Activity Type",
      "Activity Name",
      "Type",
    ]);

    const typeValues = new Set(records.map((r) => r.Type));
    expect(typeValues).toEqual(new Set(["Billable", "Internal (Non-billable)"]));

    for (const rec of records) {
      expect(parseMilestoneKind(rec["Milestone Type"])).not.toBeNull();
      expect(parseProjectType(rec["Activity Type"])).not.toBeNull();
      expect(parseBillableFlag(rec.Type)).not.toBeNull();
    }
  });
});
