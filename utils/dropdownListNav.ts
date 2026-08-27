/** Shared list navigation for dropdown menus (focus stays in search). */

export function firstEnabledIndex<T>(
  items: readonly T[],
  isDisabled?: (item: T) => boolean
): number {
  for (let i = 0; i < items.length; i++) {
    if (!isDisabled?.(items[i]!)) return i;
  }
  return -1;
}

export function nextEnabledIndex<T>(
  items: readonly T[],
  from: number,
  direction: 1 | -1,
  isDisabled?: (item: T) => boolean
): number {
  if (items.length === 0) return -1;
  if (direction === 1) {
    const start = from < 0 ? 0 : from + 1;
    for (let i = start; i < items.length; i++) {
      if (!isDisabled?.(items[i]!)) return i;
    }
    return from < 0 ? firstEnabledIndex(items, isDisabled) : from;
  }
  if (from < 0) return -1;
  for (let i = from - 1; i >= 0; i--) {
    if (!isDisabled?.(items[i]!)) return i;
  }
  return -1;
}
