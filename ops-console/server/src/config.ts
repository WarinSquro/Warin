import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** ops-console/ package root */
export const OPS_ROOT = path.resolve(__dirname, "../..");
/** Monorepo root when ops-console is checked out inside Warin */
export const REPO_ROOT = path.resolve(OPS_ROOT, "..");

export const isWindows = process.platform === "win32";
export const isLinux = process.platform === "linux";

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

/** Prefer explicit env; on Linux auto-detect /opt/warin/app (EC2). */
function resolveWarinAppDir(): string {
  if (process.env.OPS_WARIN_APP_DIR?.trim()) {
    return path.resolve(process.env.OPS_WARIN_APP_DIR.trim());
  }
  if (!isWindows && fs.existsSync("/opt/warin/app")) {
    return "/opt/warin/app";
  }
  return REPO_ROOT;
}

const warinAppDir = resolveWarinAppDir();
const posixApp = warinAppDir.replace(/\\/g, "/");
export const isEc2Layout =
  process.env.OPS_LAYOUT?.trim() === "ec2" ||
  posixApp.includes("/opt/warin/") ||
  (!isWindows && fs.existsSync("/opt/warin/app"));

function defaultDataDir(): string {
  if (process.env.OPS_DATA_DIR?.trim()) return path.resolve(process.env.OPS_DATA_DIR.trim());
  // Keep ops metadata outside git working tree on EC2 so pulls never touch it
  if (isEc2Layout) return "/opt/warin/ops-console-data";
  return path.join(OPS_ROOT, "data");
}

function defaultBackupRoot(): string {
  if (process.env.OPS_BACKUP_ROOT?.trim()) return path.resolve(process.env.OPS_BACKUP_ROOT.trim());
  if (isEc2Layout) return "/opt/warin/backups";
  return path.join(REPO_ROOT, "backups");
}

export const config = {
  port: Number(env("OPS_PORT", "9191")),
  bind: env("OPS_BIND", "127.0.0.1"),
  sessionSecret: env("OPS_SESSION_SECRET", "ops-console-dev-secret"),
  sessionTtlMs: 8 * 60 * 60 * 1000,
  dataDir: defaultDataDir(),
  warinAppDir,
  backupRoot: defaultBackupRoot(),
  sharedEnvPath: env(
    "OPS_SHARED_ENV",
    isEc2Layout ? "/opt/warin/shared/.env" : path.join(warinAppDir, ".env"),
  ),
  sharedWebPath: env(
    "OPS_SHARED_WEB",
    isEc2Layout ? "/opt/warin/shared/web" : path.join(warinAppDir, "dist"),
  ),
  viteApiBaseUrl: env("OPS_VITE_API_BASE_URL", "http://127.0.0.1/api/v1"),
  adminUser: env("OPS_ADMIN_USER", "admin"),
  adminPasswordSeed: env("OPS_ADMIN_PASSWORD", "91203"),
  serveStatic: (() => {
    const forced = process.env.OPS_SERVE_STATIC?.trim();
    if (forced === "0") return false;
    if (forced === "1") return true;
    return fs.existsSync(path.join(OPS_ROOT, "web", "dist", "index.html"));
  })(),
  webDist: path.join(OPS_ROOT, "web", "dist"),
  environmentLabel: env("OPS_ENVIRONMENT_LABEL", isEc2Layout ? "PRODUCTION" : "DEVELOPMENT"),
  platform: process.platform,
  isEc2Layout,
};

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const sub of ["db", "files", "meta", "app", "docker"]) {
    fs.mkdirSync(path.join(config.backupRoot, sub), { recursive: true });
  }
  // Restrict ops data directory on Linux (ignore on Windows)
  if (!isWindows) {
    try {
      fs.chmodSync(config.dataDir, 0o700);
    } catch {
      /* may not own dir yet */
    }
  }
}

/** Forward-slash path for bash/docker display (safe on both platforms). */
export function posixPath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/");
}
