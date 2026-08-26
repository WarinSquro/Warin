export const DATA_CHANGE_CHANNEL = "oneview:data-changed";

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

export type DataChangeAction = "create" | "update" | "delete";

export type DataChangedEvent = {
  v: 1;
  resource: DataResource;
  action: DataChangeAction;
  at: string;
  actorId?: string;
};
