/** Session email vs re-entered login email (hard-delete credential step). */
export function credentialsEmailMatches(
  sessionEmail: string | undefined | null,
  entered: string | undefined | null
): boolean {
  if (!sessionEmail || !entered) return false;
  return sessionEmail.trim().toLowerCase() === entered.trim().toLowerCase();
}
