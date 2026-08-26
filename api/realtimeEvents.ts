/** Mirrors Nest `DataChangedEvent` — keep in sync with api/realtime/data-change.types.ts */

export type DataResource =
  | "employees"
  | "masters"
  | "projects"
  | "settings"
  | "allocations"
  | "confirmations"
  | "weekly-check-in"
  | "access-rights"
  | "kpi"
  | "decision-points";

export type DataChangedEvent = {
  v: 1;
  resource: DataResource;
  action: "create" | "update" | "delete";
  at: string;
  actorId?: string;
};

export const DATA_CHANGED_EVENT = "oneview:data-changed";

export function dispatchDataChanged(detail: DataChangedEvent) {
  try {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}
