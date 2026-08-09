import { SetMetadata } from "@nestjs/common";
import type { DataChangeAction, DataResource } from "./data-change.types";

export const DATA_CHANGE_KEY = "oneview:dataChange";

export type EmitDataChangeMeta = {
  resource: DataResource;
  action: DataChangeAction;
};

/** Mark a mutation handler so successful responses publish a Redis data-change event. */
export const EmitDataChange = (resource: DataResource, action: DataChangeAction = "update") =>
  SetMetadata(DATA_CHANGE_KEY, { resource, action } satisfies EmitDataChangeMeta);
