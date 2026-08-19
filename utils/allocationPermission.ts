import type { Employee } from "../data/employees";
import { isSelfAllocation, SELF_ALLOCATION_MESSAGE } from "./selfAllocation";

/** Matches API `assertCanPlanForEmployee` — direct Resource Owner only. */
export const DIRECT_RO_ALLOCATION_MESSAGE =
  "You can only plan and manage your immediate resources";

/** True when `target` lists `actor` as their direct Resource Owner (`resourceOwnerId`). */
export function isDirectResourceOwner(
  actorHrmsId: string | undefined | null,
  targetHrmsId: string | undefined | null,
  employees: Employee[]
): boolean {
  if (!actorHrmsId || !targetHrmsId) return false;
  const target = employees.find((e) => e.id === targetHrmsId);
  return target?.resourceOwnerId === actorHrmsId;
}

/** Whether the actor may create, edit, or delete allocations for `target`. Super-admin bypass matches API. */
export function canManageAllocation(
  actorHrmsId: string | undefined | null,
  targetHrmsId: string | undefined | null,
  employees: Employee[],
  opts?: { isSuperAdmin?: boolean }
): boolean {
  if (isSelfAllocation(actorHrmsId, targetHrmsId)) return false;
  if (opts?.isSuperAdmin) return true;
  return isDirectResourceOwner(actorHrmsId, targetHrmsId, employees);
}

/** User-facing reason when allocation actions are blocked, or null when allowed. */
export function allocationBlockedMessage(
  actorHrmsId: string | undefined | null,
  targetHrmsId: string | undefined | null,
  employees: Employee[],
  opts?: { isSuperAdmin?: boolean }
): string | null {
  if (!targetHrmsId) return null;
  if (isSelfAllocation(actorHrmsId, targetHrmsId)) return SELF_ALLOCATION_MESSAGE;
  if (!canManageAllocation(actorHrmsId, targetHrmsId, employees, opts)) {
    return DIRECT_RO_ALLOCATION_MESSAGE;
  }
  return null;
}
