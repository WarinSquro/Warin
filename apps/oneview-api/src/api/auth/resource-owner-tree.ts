/** Direct + indirect reports under a Resource Owner (excludes the owner). */
export function descendantEmployeeIds(
  ownerId: string,
  rows: { id: string; resourceOwnerId: string | null }[]
): string[] {
  const ownerKey = ownerId.trim();
  if (!ownerKey) return [];

  const byOwner = new Map<string, string[]>();
  for (const r of rows) {
    if (r.resourceOwnerId == null) continue;
    const key = String(r.resourceOwnerId).trim();
    if (!key) continue;
    const list = byOwner.get(key) ?? [];
    list.push(String(r.id));
    byOwner.set(key, list);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [ownerKey];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of byOwner.get(current) ?? []) {
      const childKey = child.trim();
      if (!childKey || seen.has(childKey) || childKey === ownerKey) continue;
      seen.add(childKey);
      out.push(childKey);
      queue.push(childKey);
    }
  }
  return out;
}
