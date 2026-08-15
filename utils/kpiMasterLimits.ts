export type KpiMasterKindLimit = "categories" | "methods" | "units";

export const KPI_MASTER_NAME_MAX: Record<KpiMasterKindLimit, number> = {
  categories: 20,
  methods: 200,
  units: 10,
};

export function clampKpiMasterName(kind: KpiMasterKindLimit, name: string): string {
  return name.slice(0, KPI_MASTER_NAME_MAX[kind]);
}
