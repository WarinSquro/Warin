/** Stable multi-select fingerprint so new array identity alone does not reset pagination. */
export function multiSelectSignature(values: readonly string[]): string {
  return [...values].map(String).sort().join("\u0001");
}

const PAGE_PREFIX = "oneview_report_page_";

export function readReportPage(reportKey: string): number {
  try {
    const n = Number(sessionStorage.getItem(`${PAGE_PREFIX}${reportKey}`));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  } catch {
    return 1;
  }
}

export function writeReportPage(reportKey: string, page: number): void {
  try {
    sessionStorage.setItem(`${PAGE_PREFIX}${reportKey}`, String(Math.max(1, Math.floor(page))));
  } catch {
    /* ignore quota / private mode */
  }
}
