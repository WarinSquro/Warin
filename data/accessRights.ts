import { getAllAssignableKeys } from "./navConfig";

const STORAGE_KEY = "oneview_access_rights_v1";
const STORAGE_VERSION_KEY = "oneview_access_rights_version";
const STORAGE_VERSION = 2;

export const SUPER_ADMIN_EMAIL = "admin@acme.io";

type RightsStore = Record<string, string[]>;

/** Demo seeds — baseline rights for non-admin logins (always merged in). */
const SEED_RIGHTS: RightsStore = {
  "EMP-1042": [
    "my_workspace",
    "planner",
    "availability",
    "utilization",
    "confirmations",
    "reports.deployment",
    "reports.performance",
    "reports.execution",
    "reports.daily_work",
    "reports.workday_summary",
    "my_team.weekly_check_in",
  ],
  "EMP-1043": ["my_workspace", "planner", "confirmations", "reports.performance", "reports.daily_work", "reports.workday_summary"],
  "EMP-1051": ["my_workspace", "confirmations", "reports.execution", "reports.daily_work", "reports.workday_summary", "my_team.weekly_check_in"],
  "EMP-1088": ["my_workspace", "utilization", "confirmations", "my_team.weekly_check_in"],
};

function readRawOverrides(): RightsStore {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RightsStore;
  } catch {
    return {};
  }
}

function writeOverrides(overrides: RightsStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** Union seed defaults with stored overrides so newly added demo keys always apply. */
function mergeWithSeeds(overrides: RightsStore): RightsStore {
  const merged: RightsStore = { ...overrides };
  for (const [employeeId, seedKeys] of Object.entries(SEED_RIGHTS)) {
    const stored = merged[employeeId] ?? [];
    merged[employeeId] = [...new Set([...seedKeys, ...stored])];
  }
  return merged;
}

function migrateAccessRightsIfNeeded(): void {
  if (typeof localStorage === "undefined") return;
  const version = parseInt(localStorage.getItem(STORAGE_VERSION_KEY) ?? "1", 10);
  if (version >= STORAGE_VERSION) return;

  const overrides = readRawOverrides();
  const merged = mergeWithSeeds(overrides);
  const toPersist: RightsStore = { ...overrides };

  for (const employeeId of new Set([...Object.keys(SEED_RIGHTS), ...Object.keys(overrides)])) {
    toPersist[employeeId] = merged[employeeId] ?? overrides[employeeId] ?? [];
  }

  writeOverrides(toPersist);
  localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
}

function readStore(): RightsStore {
  migrateAccessRightsIfNeeded();
  const overrides = readRawOverrides();
  if (Object.keys(overrides).length === 0) {
    return { ...SEED_RIGHTS };
  }
  return mergeWithSeeds(overrides);
}

export function getEmployeePageKeys(employeeId: string): string[] {
  const store = readStore();
  return store[employeeId] ?? [];
}

export function setEmployeePageKeys(employeeId: string, keys: string[]): void {
  const overrides = readRawOverrides();
  overrides[employeeId] = keys;
  writeOverrides(overrides);
}

export function initEmptyEmployeeRights(employeeId: string): void {
  if (employeeId in SEED_RIGHTS) return;
  const overrides = readRawOverrides();
  if (!(employeeId in overrides)) {
    overrides[employeeId] = [];
    writeOverrides(overrides);
  }
}

export function countGrantedKeys(keys: string[], includeSuperAdminOnly = false): { granted: number; total: number } {
  const total = getAllAssignableKeys(includeSuperAdminOnly).length;
  const assignable = new Set(getAllAssignableKeys(includeSuperAdminOnly));
  const granted = keys.filter((k) => assignable.has(k)).length;
  return { granted, total };
}

export function isSuperAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

export function getSuperAdminAssignableKeys(): string[] {
  return getAllAssignableKeys(true);
}
