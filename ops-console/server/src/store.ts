import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

export type BackupType = "database" | "application" | "docker" | "predeploy";
export type BackupStatus = "running" | "success" | "failed" | "verified";

export interface BackupRecord {
  id: string;
  type: BackupType;
  status: BackupStatus;
  createdAt: string;
  completedAt?: string;
  sizeBytes?: number;
  location: string;
  gitSha?: string;
  imageTags?: string[];
  error?: string;
  retentionClass?: string;
  expiresAt?: string;
  restoreAvailable: boolean;
  manifestPath?: string;
  relatedPaths?: string[];
}

export interface AuditRecord {
  id: string;
  at: string;
  user: string;
  action: string;
  result: "success" | "failed" | "denied" | "info";
  gitSha?: string;
  detail?: string;
  error?: string;
}

export interface DeploymentRecord {
  id: string;
  at: string;
  user: string;
  status: "running" | "success" | "failed" | "blocked";
  fromSha?: string;
  toSha?: string;
  backupId?: string;
  steps: { name: string; status: string; detail?: string }[];
  error?: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface RetentionPolicy {
  hourlyHours: number;
  dailyDays: number;
  weeklyWeeks: number;
  predeployKeep: number;
  monthlyMonths: number;
}

export interface OpsStore {
  version: 1;
  /** Explicit: this file is ops-console only — never WARIN Postgres */
  storageBoundary: "ops-console-json-independent-of-warin-db";
  auth: {
    userId: string;
    passwordHash: string;
  };
  retention: RetentionPolicy;
  sessions: SessionRecord[];
  backups: BackupRecord[];
  deployments: DeploymentRecord[];
  audit: AuditRecord[];
  checklist: Record<string, boolean>;
  settings: {
    requirePredeployBackup: boolean;
  };
}

const DEFAULT_RETENTION: RetentionPolicy = {
  hourlyHours: 24,
  dailyDays: 14,
  weeklyWeeks: 8,
  predeployKeep: 10,
  monthlyMonths: 12,
};

const GO_LIVE_KEYS = [
  "gitVerified",
  "prodEnvVerified",
  "configVerified",
  "dbConnectivity",
  "dbBackupDone",
  "appDockerBackupDone",
  "diskSpaceOk",
  "dockerHealthOk",
  "portsSecurityOk",
  "sslVerified",
  "migrationsReviewed",
  "noDestructiveMigration",
  "healthEndpointOk",
  "logsChecked",
  "rollbackVersionIdentified",
  "restoreProcedureAvailable",
  "smokeTestDone",
] as const;

function storePath() {
  return path.join(config.dataDir, "ops-store.json");
}

function emptyStore(passwordHash: string): OpsStore {
  return {
    version: 1,
    storageBoundary: "ops-console-json-independent-of-warin-db",
    auth: { userId: config.adminUser, passwordHash },
    retention: { ...DEFAULT_RETENTION },
    sessions: [],
    backups: [],
    deployments: [],
    audit: [],
    checklist: Object.fromEntries(GO_LIVE_KEYS.map((k) => [k, false])),
    settings: { requirePredeployBackup: true },
  };
}

let cache: OpsStore | null = null;

export function loadStore(): OpsStore {
  if (cache) return cache;
  const p = storePath();
  if (!fs.existsSync(p)) {
    const hash = bcrypt.hashSync(config.adminPasswordSeed, 12);
    cache = emptyStore(hash);
    saveStore(cache);
    return cache;
  }
  const raw = fs.readFileSync(p, "utf8");
  cache = JSON.parse(raw) as OpsStore;
  // Ops-console has a single seeded admin PIN (no change-PIN UI). Apply the current seed
  // so a PIN change in config takes effect on existing ops-store.json files.
  if (!bcrypt.compareSync(config.adminPasswordSeed, cache.auth.passwordHash)) {
    cache.auth.passwordHash = bcrypt.hashSync(config.adminPasswordSeed, 12);
    cache.sessions = [];
    saveStore(cache);
  }
  return cache;
}

export function saveStore(store: OpsStore) {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* windows */
  }
  cache = store;
}

export function mutateStore(fn: (s: OpsStore) => void): OpsStore {
  const s = loadStore();
  fn(s);
  saveStore(s);
  return s;
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

export function appendAudit(
  user: string,
  action: string,
  result: AuditRecord["result"],
  extra?: Partial<Pick<AuditRecord, "gitSha" | "detail" | "error">>,
) {
  mutateStore((s) => {
    s.audit.unshift({
      id: newId("aud"),
      at: new Date().toISOString(),
      user,
      action,
      result,
      gitSha: extra?.gitSha,
      detail: redactSecrets(extra?.detail),
      error: redactSecrets(extra?.error),
    });
    if (s.audit.length > 2000) s.audit.length = 2000;
  });
}

export function redactSecrets(text?: string | null): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|jwt)\s*[=:]\s*\S+/gi, "$1=***")
    .replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
}

export { GO_LIVE_KEYS, DEFAULT_RETENTION };
