export type KpiMasterKindLimit = "categories" | "methods" | "units";

export const KPI_MASTER_NAME_MAX: Record<KpiMasterKindLimit, number> = {
  categories: 20,
  methods: 200,
  units: 10,
};

/** KPI framework item name (KPI column). */
export const KPI_NAME_MAX = 200;

/** Target value: max 4 digit characters (0–9999). */
export const KPI_TARGET_MAX_DIGITS = 4;
export const KPI_TARGET_MAX = 9999;

/** Weight %: 0–100 (max 3 digits; clamped to 100). */
export const KPI_WEIGHT_MAX = 100;
export const KPI_WEIGHT_MAX_DIGITS = 3;

export function clampKpiMasterName(kind: KpiMasterKindLimit, name: string): string {
  return name.slice(0, KPI_MASTER_NAME_MAX[kind]);
}
