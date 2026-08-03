export function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function getPresetParam(search: string): string | null {
  return parseSearchParams(search).get("preset");
}

export function getStatusParam(search: string): string | null {
  return parseSearchParams(search).get("status");
}

export function getDepartmentParam(search: string): string | null {
  return parseSearchParams(search).get("department");
}

export function getPanelParam(search: string): string | null {
  return parseSearchParams(search).get("panel");
}

export function getHighlightParam(search: string): string | null {
  return parseSearchParams(search).get("highlight");
}
