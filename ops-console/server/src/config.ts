import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const OPS_ROOT = path.resolve(__dirname, "../..");
export const REPO_ROOT = path.resolve(OPS_ROOT, "..");

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

const warinAppDir = path.resolve(env("OPS_WARIN_APP_DIR", REPO_ROOT));
const isEc2Layout = warinAppDir.replace(/\\/g, "/").includes("/opt/warin/");

export const config = {
  port: Number(env("OPS_PORT", "9191")),
  bind: env("OPS_BIND", "127.0.0.1"),
  sessionSecret: env("OPS_SESSION_SECRET", "ops-console-dev-secret"),
  sessionTtlMs: 8 * 60 * 60 * 1000,
  dataDir: path.resolve(env("OPS_DATA_DIR", path.join(OPS_ROOT, "data"))),
  warinAppDir,
  backupRoot: path.resolve(
    env("OPS_BACKUP_ROOT", isEc2Layout ? "/opt/warin/backups" : path.join(REPO_ROOT, "backups")),
  ),
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
  adminPasswordSeed: env("OPS_ADMIN_PASSWORD", "19312"),
  serveStatic: env("OPS_SERVE_STATIC", process.env.NODE_ENV === "production" ? "1" : "0") === "1",
  webDist: path.join(OPS_ROOT, "web", "dist"),
  environmentLabel: env("OPS_ENVIRONMENT_LABEL", "PRODUCTION"),
};

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const sub of ["db", "files", "meta", "app", "docker"]) {
    fs.mkdirSync(path.join(config.backupRoot, sub), { recursive: true });
  }
}
