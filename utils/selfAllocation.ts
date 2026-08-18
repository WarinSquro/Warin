/** True when the actor would allocate (or edit/delete allocation) for themselves. */
export function isSelfAllocation(
  actorHrmsId: string | undefined | null,
  targetHrmsId: string | undefined | null
): boolean {
  if (!actorHrmsId || !targetHrmsId) return false;
  return actorHrmsId === targetHrmsId;
}

export const SELF_ALLOCATION_MESSAGE = "You cannot allocate work to yourself";
