import { describe, expect, it } from "vitest";
import {
  clampKpiMasterName,
  KPI_MASTER_NAME_MAX,
  KPI_NAME_MAX,
  KPI_WEIGHT_MAX,
  KPI_WEIGHT_MAX_DIGITS,
} from "../../utils/kpiMasterLimits";

describe("kpiMasterLimits", () => {
  it("caps category at 20, method at 200, unit at 10", () => {
    expect(KPI_MASTER_NAME_MAX.categories).toBe(20);
    expect(KPI_MASTER_NAME_MAX.methods).toBe(200);
    expect(KPI_MASTER_NAME_MAX.units).toBe(10);
    expect(clampKpiMasterName("categories", "x".repeat(25))).toHaveLength(20);
    expect(clampKpiMasterName("methods", "m".repeat(201))).toHaveLength(200);
    expect(clampKpiMasterName("units", "Percentile")).toHaveLength(10);
  });

  it("caps KPI name at 200", () => {
    expect(KPI_NAME_MAX).toBe(200);
  });

  it("caps weight % at 100 with 3 digit max", () => {
    expect(KPI_WEIGHT_MAX).toBe(100);
    expect(KPI_WEIGHT_MAX_DIGITS).toBe(3);
  });
});
