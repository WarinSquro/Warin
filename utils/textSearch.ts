/** Case-insensitive substring match across optional string/number fields. */
export function matchesSearchQuery(
  query: string,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => {
    if (f == null) return false;
    return String(f).toLowerCase().includes(q);
  });
}
