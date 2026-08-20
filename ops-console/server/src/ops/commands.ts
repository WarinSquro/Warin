import path from "node:path";
import { config } from "../config.js";

export interface ManualCommand {
  id: string;
  category: string;
  title: string;
  description: string;
  command: string;
  /** If set, server may execute via allowlist */
  runnable?: boolean;
  destructive?: boolean;
}

function app() {
  return config.warinAppDir.replace(/\\/g, "/");
}
function backups() {
  return config.backupRoot.replace(/\\/g, "/");
}

/** Commands based on actual Warin/EC2 layout + scripts in this repo. */
export function buildManualCommands(): ManualCommand[] {
  const A = app();
  const B = backups();
  const vite = config.viteApiBaseUrl;
  return [
    {
      id: "server_uptime",
      category: "Server status",
      title: "Host uptime / load",
      description: "Kernel uptime and load averages",
      command: "uptime",
      runnable: true,
    },
    {
      id: "server_uname",
      category: "Server status",
      title: "Kernel info",
      description: "uname -a",
      command: "uname -a",
      runnable: true,
    },
    {
      id: "disk_df",
      category: "Disk space",
      title: "Filesystem usage",
      description: "df -h",
      command: "df -h",
      runnable: true,
    },
    {
      id: "disk_backups",
      category: "Disk space",
      title: "Backup directory size",
      description: "du summary for backup root",
      command: `du -sh ${B} ${B}/* 2>/dev/null || true`,
      runnable: true,
    },
    {
      id: "docker_info",
      category: "Docker status",
      title: "Docker info (summary)",
      description: "Engine reachable",
      command: "docker info --format '{{.ServerVersion}} {{.Driver}}'",
      runnable: true,
    },
    {
      id: "docker_ps",
      category: "Container listing",
      title: "List containers",
      description: "docker ps -a",
      command: "docker ps -a",
      runnable: true,
    },
    {
      id: "docker_health",
      category: "Container health",
      title: "Health status",
      description: "Name + Health",
      command: `docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`,
      runnable: true,
    },
    {
      id: "docker_logs_api",
      category: "Container logs",
      title: "API logs (last 100)",
      description: "oneview-api",
      command: "docker logs --tail 100 oneview-api",
      runnable: true,
    },
    {
      id: "docker_logs_postgres",
      category: "Container logs",
      title: "Postgres logs (last 50)",
      description: "oneview-postgres",
      command: "docker logs --tail 50 oneview-postgres",
      runnable: true,
    },
    {
      id: "db_backup_script",
      category: "Database backup",
      title: "Daily DB+files backup (ec2-backup.sh)",
      description: "Uses scripts/ec2-backup.sh daily",
      command: `bash ${A}/scripts/ec2-backup.sh daily`,
      runnable: false,
    },
    {
      id: "db_backup_manual",
      category: "Database backup",
      title: "Manual pg_dump",
      description: "Custom-format dump into backup root",
      command: `STAMP=$(date +%Y%m%d_%H%M%S); DUMP=oneview_$STAMP.dump; docker exec oneview-postgres pg_dump -U admin -d oneview -F c -f /backups/$DUMP && docker cp oneview-postgres:/backups/$DUMP ${B}/db/$DUMP && docker exec oneview-postgres rm -f /backups/$DUMP`,
      runnable: false,
    },
    {
      id: "db_restore",
      category: "Database restore",
      title: "Restore dump (destructive)",
      description: "scripts/restore-postgres.sh — confirm first",
      command: `bash ${A}/scripts/restore-postgres.sh ${B}/db/REPLACE_WITH_DUMP.dump`,
      runnable: false,
      destructive: true,
    },
    {
      id: "app_backup",
      category: "Application backup",
      title: "Uploaded files tar",
      description: "From API volume /data/files",
      command: `STAMP=$(date +%Y%m%d_%H%M%S); docker exec oneview-api sh -c 'cd /data/files && tar -czf - .' > ${B}/files/files_$STAMP.tar.gz`,
      runnable: false,
    },
    {
      id: "docker_backup_compose",
      category: "Docker backup",
      title: "Archive compose + infra nginx",
      description: "Config only (no secrets content in UI)",
      command: `STAMP=$(date +%Y%m%d_%H%M%S); tar -czf ${B}/docker/compose_$STAMP.tar.gz -C ${A} docker-compose.yml infra/nginx 2>/dev/null || tar -czf ${B}/docker/compose_$STAMP.tar.gz -C ${A} docker-compose.yml`,
      runnable: false,
    },
    {
      id: "compose_up",
      category: "Start containers",
      title: "Compose up",
      description: "docker compose up -d",
      command: `cd ${A} && docker compose up -d`,
      runnable: false,
      destructive: true,
    },
    {
      id: "compose_stop",
      category: "Stop containers",
      title: "Compose stop",
      description: "Stops stack",
      command: `cd ${A} && docker compose stop`,
      runnable: false,
      destructive: true,
    },
    {
      id: "compose_restart",
      category: "Restart containers",
      title: "Restart api + worker",
      description: "After migrate",
      command: `cd ${A} && docker compose restart api worker`,
      runnable: false,
      destructive: true,
    },
    {
      id: "git_pull",
      category: "Pull latest code/image",
      title: "git pull origin main",
      description: "Pull-only on server",
      command: `cd ${A} && git pull origin main`,
      runnable: false,
      destructive: true,
    },
    {
      id: "deploy_full",
      category: "Deployment",
      title: "Recommended deploy sequence",
      description: "Predeploy → pull → build → migrate → SPA",
      command: [
        `bash ${A}/scripts/ec2-backup.sh predeploy`,
        `cd ${A} && git pull origin main`,
        `cd ${A} && docker compose up -d --build api worker`,
        `cd ${A} && docker compose exec api npx prisma migrate deploy --schema=/app/prisma/schema.prisma`,
        `cd ${A} && docker compose restart api worker`,
        `cd ${A} && export VITE_API_BASE_URL="${vite}" && npx vite build && test -f dist/index.html`,
        `rm -rf ${config.sharedWebPath.replace(/\\/g, "/")}/* && cp -a ${A}/dist/. ${config.sharedWebPath.replace(/\\/g, "/")}/`,
      ].join("\n"),
      runnable: false,
      destructive: true,
    },
    {
      id: "migrate_deploy",
      category: "Database migration",
      title: "prisma migrate deploy",
      description: "Always use schema path inside container",
      command: `cd ${A} && docker compose exec api npx prisma migrate deploy --schema=/app/prisma/schema.prisma`,
      runnable: false,
      destructive: true,
    },
    {
      id: "rollback_hint",
      category: "Rollback",
      title: "Rollback guidance",
      description: "Identify SHA + predeploy dump; restore + rebuild",
      command: `# 1) Identify last good SHA + predeploy dump under ${B}/db\n# 2) SPA-only: checkout SHA → vite build → copy shared/web\n# 3) API: checkout SHA → docker compose up -d --build api worker\n# 4) Data: bash ${A}/scripts/restore-postgres.sh <dump> (confirm!)`,
      runnable: false,
      destructive: true,
    },
    {
      id: "docker_prune",
      category: "Docker cleanup",
      title: "Prune unused images (careful)",
      description: "Does not remove volumes",
      command: "docker image prune -f",
      runnable: false,
      destructive: true,
    },
    {
      id: "health_api",
      category: "Application health verification",
      title: "API health",
      description: "/api/v1/health via localhost compose nginx or API",
      command: "curl -sf http://127.0.0.1:8080/api/v1/health || curl -sf http://127.0.0.1:3001/api/v1/health",
      runnable: true,
    },
    {
      id: "health_git",
      category: "Application health verification",
      title: "Current Git SHA",
      description: "Deployed checkout",
      command: `git -C ${A} rev-parse --short HEAD && git -C ${A} status -sb`,
      runnable: true,
    },
  ];
}

export const RUNNABLE_SAFE_IDS = new Set(
  buildManualCommands()
    .filter((c) => c.runnable && !c.destructive)
    .map((c) => c.id),
);

export function resolveRunnable(id: string): ManualCommand | null {
  const cmd = buildManualCommands().find((c) => c.id === id);
  if (!cmd || !cmd.runnable || cmd.destructive) return null;
  return cmd;
}

export function assertPathInsideBackupRoot(filePath: string): string {
  const resolved = path.resolve(filePath);
  const root = path.resolve(config.backupRoot);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path outside backup root");
  }
  const norm = resolved.replace(/\\/g, "/");
  if (!/\/db\//.test(norm) && !norm.endsWith("/db")) {
    if (!/\.dump$/i.test(resolved)) throw new Error("Only .dump files under backup root may be restored");
  }
  return resolved;
}

export type DownloadableBackupKind = "database" | "application" | "docker";

/** Stream-safe path check for local download of backup artifacts (not restore). */
export function assertDownloadableBackupArtifact(
  filePath: string,
  kind: DownloadableBackupKind,
): string {
  const resolved = path.resolve(filePath);
  const root = path.resolve(config.backupRoot);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path outside backup root");
  }

  const expectedExt = kind === "database" ? ".dump" : ".tar.gz";
  const normRel = rel.replace(/\\/g, "/");
  const allowedPrefixes =
    kind === "database" ? ["db/"] : kind === "application" ? ["app/", "files/"] : ["docker/"];
  if (!allowedPrefixes.some((p) => normRel.startsWith(p) || normRel === p.replace(/\/$/, ""))) {
    throw new Error(`Download path must be under backups/${allowedPrefixes.join(" or ")}`);
  }
  if (!resolved.toLowerCase().endsWith(expectedExt)) {
    throw new Error(`Only ${expectedExt} files may be downloaded for ${kind} backups`);
  }
  return resolved;
}
