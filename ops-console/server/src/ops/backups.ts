import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { appendAudit, loadStore, mutateStore, newId, type BackupRecord, type BackupType } from "../store.js";
import { runBash, runCommand } from "./runner.js";
import { assertPathInsideBackupRoot } from "./commands.js";

async function gitSha(): Promise<string> {
  const r = await runCommand("git", ["-C", config.warinAppDir, "rev-parse", "--short", "HEAD"]);
  return r.ok ? r.stdout.trim() : "unknown";
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function expiresFor(type: BackupType, createdAt: Date): { class: string; expiresAt: string } {
  const ret = loadStore().retention;
  const d = new Date(createdAt);
  if (type === "predeploy") {
    d.setDate(d.getDate() + 90);
    return { class: "predeploy", expiresAt: d.toISOString() };
  }
  d.setDate(d.getDate() + ret.dailyDays);
  return { class: "daily", expiresAt: d.toISOString() };
}

export async function createDatabaseBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const sha = await gitSha();
  const dumpName = `oneview_database_${stamp}_${sha}.dump`;
  const location = path.join(config.backupRoot, "db", dumpName);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("database", new Date(createdAt));

  mutateStore((s) => {
    s.backups.unshift({
      id,
      type: "database",
      status: "running",
      createdAt,
      location,
      gitSha: sha,
      restoreAvailable: false,
      retentionClass: exp.class,
      expiresAt: exp.expiresAt,
    });
  });
  appendAudit(user, "backup.database.started", "info", { gitSha: sha, detail: dumpName });

  const script = `
set -e
DUMP="${dumpName}"
docker exec oneview-postgres pg_dump -U admin -d oneview -F c -f "/backups/$DUMP"
docker cp "oneview-postgres:/backups/$DUMP" "${location.replace(/\\/g, "/")}"
docker exec oneview-postgres rm -f "/backups/$DUMP"
test -f "${location.replace(/\\/g, "/")}"
`;
  const result = await runBash(script, { cwd: config.warinAppDir, timeoutMs: 20 * 60 * 1000 });

  if (!result.ok || !fs.existsSync(location)) {
    mutateStore((s) => {
      const b = s.backups.find((x) => x.id === id);
      if (b) {
        b.status = "failed";
        b.completedAt = new Date().toISOString();
        b.error = result.stderr || result.stdout || "Dump failed";
      }
    });
    appendAudit(user, "backup.database.failed", "failed", { gitSha: sha, error: result.stderr });
    throw new Error(result.stderr || "Database backup failed");
  }

  const size = fileSize(location);
  mutateStore((s) => {
    const b = s.backups.find((x) => x.id === id);
    if (b) {
      b.status = "success";
      b.completedAt = new Date().toISOString();
      b.sizeBytes = size;
      b.restoreAvailable = true;
    }
  });
  appendAudit(user, "backup.database.completed", "success", { gitSha: sha, detail: location });
  return loadStore().backups.find((x) => x.id === id)!;
}

export async function createApplicationBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const sha = await gitSha();
  const tarName = `files_application_${stamp}_${sha}.tar.gz`;
  const location = path.join(config.backupRoot, "files", tarName);
  const metaGit = path.join(config.backupRoot, "meta", `git_application_${stamp}_${sha}.txt`);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("application", new Date(createdAt));

  mutateStore((s) => {
    s.backups.unshift({
      id,
      type: "application",
      status: "running",
      createdAt,
      location,
      gitSha: sha,
      restoreAvailable: false,
      retentionClass: exp.class,
      expiresAt: exp.expiresAt,
      relatedPaths: [metaGit],
    });
  });
  appendAudit(user, "backup.application.started", "info", { gitSha: sha });

  fs.writeFileSync(metaGit, `git_sha=${sha}\nat=${createdAt}\n`, { mode: 0o600 });

  const loc = location.replace(/\\/g, "/");
  const result = await runBash(
    `docker exec oneview-api sh -c 'cd /data/files && tar -czf - .' > "${loc}" && test -s "${loc}"`,
    { timeoutMs: 20 * 60 * 1000 },
  );

  if (!result.ok) {
    mutateStore((s) => {
      const b = s.backups.find((x) => x.id === id);
      if (b) {
        b.status = "failed";
        b.completedAt = new Date().toISOString();
        b.error = result.stderr || "Application backup failed";
      }
    });
    appendAudit(user, "backup.application.failed", "failed", { error: result.stderr });
    throw new Error(result.stderr || "Application backup failed");
  }

  const size = fileSize(location);
  mutateStore((s) => {
    const b = s.backups.find((x) => x.id === id);
    if (b) {
      b.status = "success";
      b.completedAt = new Date().toISOString();
      b.sizeBytes = size;
      b.restoreAvailable = true;
    }
  });
  appendAudit(user, "backup.application.completed", "success", { gitSha: sha, detail: location });
  return loadStore().backups.find((x) => x.id === id)!;
}

export async function createDockerBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const sha = await gitSha();
  const tarName = `docker_deploy_${stamp}_${sha}.tar.gz`;
  const location = path.join(config.backupRoot, "docker", tarName);
  const manifest = path.join(config.backupRoot, "meta", `MANIFEST_docker_${stamp}_${sha}.txt`);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("docker", new Date(createdAt));

  // Copy .env to meta with restricted perms — NEVER return contents to UI
  const envCopy = path.join(config.backupRoot, "meta", `env_docker_${stamp}_${sha}.env`);
  let envCopied = false;
  if (fs.existsSync(config.sharedEnvPath)) {
    fs.copyFileSync(config.sharedEnvPath, envCopy);
    try {
      fs.chmodSync(envCopy, 0o600);
    } catch {
      /* */
    }
    envCopied = true;
  }

  fs.writeFileSync(
    manifest,
    [
      `type=docker`,
      `git_sha=${sha}`,
      `at=${createdAt}`,
      `compose=${path.join(config.warinAppDir, "docker-compose.yml")}`,
      `env_copy=${envCopied ? envCopy : "none"}`,
      `note=.env content never exposed via ops-console API`,
    ].join("\n") + "\n",
    { mode: 0o600 },
  );

  mutateStore((s) => {
    s.backups.unshift({
      id,
      type: "docker",
      status: "running",
      createdAt,
      location,
      gitSha: sha,
      restoreAvailable: false,
      retentionClass: exp.class,
      expiresAt: exp.expiresAt,
      manifestPath: manifest,
      relatedPaths: envCopied ? [envCopy, manifest] : [manifest],
    });
  });
  appendAudit(user, "backup.docker.started", "info", { gitSha: sha });

  const A = config.warinAppDir.replace(/\\/g, "/");
  const loc = location.replace(/\\/g, "/");
  const result = await runBash(
    `tar -czf "${loc}" -C "${A}" docker-compose.yml scripts/ec2-backup.sh scripts/backup-postgres.sh scripts/restore-postgres.sh 2>/dev/null; ` +
      `test -f "${A}/infra/nginx" && tar -rzf "${loc}" -C "${A}" infra/nginx || true; ` +
      `test -s "${loc}"`,
    { timeoutMs: 10 * 60 * 1000 },
  );

  if (!result.ok) {
    mutateStore((s) => {
      const b = s.backups.find((x) => x.id === id);
      if (b) {
        b.status = "failed";
        b.completedAt = new Date().toISOString();
        b.error = result.stderr || "Docker/config backup failed";
      }
    });
    appendAudit(user, "backup.docker.failed", "failed", { error: result.stderr });
    throw new Error(result.stderr || "Docker backup failed");
  }

  const size = fileSize(location);
  mutateStore((s) => {
    const b = s.backups.find((x) => x.id === id);
    if (b) {
      b.status = "success";
      b.completedAt = new Date().toISOString();
      b.sizeBytes = size;
      b.restoreAvailable = true;
    }
  });
  appendAudit(user, "backup.docker.completed", "success", { gitSha: sha, detail: location });
  return loadStore().backups.find((x) => x.id === id)!;
}

export async function createPredeployBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const sha = await gitSha();
  const createdAt = new Date().toISOString();
  const scriptPath = path.join(config.warinAppDir, "scripts", "ec2-backup.sh");
  const exp = expiresFor("predeploy", new Date(createdAt));

  mutateStore((s) => {
    s.backups.unshift({
      id,
      type: "predeploy",
      status: "running",
      createdAt,
      location: path.join(config.backupRoot, "db"),
      gitSha: sha,
      restoreAvailable: false,
      retentionClass: exp.class,
      expiresAt: exp.expiresAt,
    });
  });
  appendAudit(user, "backup.predeploy.started", "info", { gitSha: sha });

  let result;
  if (fs.existsSync(scriptPath)) {
    result = await runBash(`bash "${scriptPath.replace(/\\/g, "/")}" predeploy`, {
      cwd: config.warinAppDir,
      timeoutMs: 25 * 60 * 1000,
      env: {
        ...process.env,
        WARIN_BACKUP_ROOT: config.backupRoot,
        WARIN_APP_DIR: config.warinAppDir,
        WARIN_SHARED_ENV: config.sharedEnvPath,
      },
    });
  } else {
    // Fallback: sequential DB + app + docker
    await createDatabaseBackup(user);
    await createApplicationBackup(user);
    await createDockerBackup(user);
    result = { ok: true, stdout: "fallback sequential", stderr: "", code: 0, durationMs: 0, command: "fallback" };
  }

  // Find newest predeploy dump
  const dbDir = path.join(config.backupRoot, "db");
  let newest = "";
  let newestMtime = 0;
  if (fs.existsSync(dbDir)) {
    for (const f of fs.readdirSync(dbDir)) {
      if (!f.includes("predeploy") && !f.endsWith(".dump")) continue;
      if (!f.endsWith(".dump")) continue;
      const st = fs.statSync(path.join(dbDir, f));
      if (st.mtimeMs > newestMtime) {
        newestMtime = st.mtimeMs;
        newest = path.join(dbDir, f);
      }
    }
  }

  if (!result.ok) {
    mutateStore((s) => {
      const b = s.backups.find((x) => x.id === id);
      if (b) {
        b.status = "failed";
        b.completedAt = new Date().toISOString();
        b.error = result.stderr || "Pre-deploy backup failed";
      }
    });
    appendAudit(user, "backup.predeploy.failed", "failed", { error: result.stderr });
    throw new Error(result.stderr || "Pre-deploy backup failed");
  }

  const location = newest || path.join(config.backupRoot, "db");
  const size = newest ? fileSize(newest) : 0;
  mutateStore((s) => {
    const b = s.backups.find((x) => x.id === id);
    if (b) {
      b.status = "verified";
      b.completedAt = new Date().toISOString();
      b.location = location;
      b.sizeBytes = size;
      b.restoreAvailable = Boolean(newest);
    }
  });
  appendAudit(user, "backup.predeploy.completed", "success", { gitSha: sha, detail: location });
  return loadStore().backups.find((x) => x.id === id)!;
}

export async function restoreDatabase(user: string, dumpPath: string, confirm: boolean): Promise<void> {
  if (!confirm) throw new Error("Confirmation required for database restore");
  const resolved = assertPathInsideBackupRoot(dumpPath);
  if (!fs.existsSync(resolved)) throw new Error("Dump file not found");
  if (!resolved.endsWith(".dump")) throw new Error("Only .dump files allowed");

  const sha = await gitSha();
  appendAudit(user, "restore.database.started", "info", { gitSha: sha, detail: path.basename(resolved) });

  const script = path.join(config.warinAppDir, "scripts", "restore-postgres.sh");
  const result = fs.existsSync(script)
    ? await runBash(`bash "${script.replace(/\\/g, "/")}" "${resolved.replace(/\\/g, "/")}"`, {
        cwd: config.warinAppDir,
        timeoutMs: 30 * 60 * 1000,
      })
    : await runBash(
        `docker cp "${resolved.replace(/\\/g, "/")}" oneview-postgres:/backups/restore.dump && docker exec oneview-postgres pg_restore -U admin -d oneview -c /backups/restore.dump`,
        { timeoutMs: 30 * 60 * 1000 },
      );

  if (!result.ok) {
    appendAudit(user, "restore.database.failed", "failed", { error: result.stderr });
    throw new Error(result.stderr || "Restore failed");
  }
  appendAudit(user, "restore.database.completed", "success", { gitSha: sha, detail: path.basename(resolved) });
}

export function scanFilesystemBackups(): Partial<BackupRecord>[] {
  const out: Partial<BackupRecord>[] = [];
  const dbDir = path.join(config.backupRoot, "db");
  if (!fs.existsSync(dbDir)) return out;
  for (const f of fs.readdirSync(dbDir)) {
    if (!f.endsWith(".dump")) continue;
    const full = path.join(dbDir, f);
    const st = fs.statSync(full);
    let type: BackupType = "database";
    if (f.includes("predeploy")) type = "predeploy";
    out.push({
      type,
      location: full,
      sizeBytes: st.size,
      createdAt: st.mtime.toISOString(),
      status: "success",
      restoreAvailable: true,
      gitSha: f.split("_").pop()?.replace(".dump", ""),
    });
  }
  return out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function backupSummary() {
  const store = loadStore();
  const fsScan = scanFilesystemBackups();
  const success = store.backups.filter((b) => b.status === "success" || b.status === "verified");
  const db = success.filter((b) => b.type === "database" || b.type === "predeploy");
  const app = success.filter((b) => b.type === "application");
  const latest = success[0] || null;
  const latestOk = success.find((b) => b.status === "success" || b.status === "verified") || null;
  const oldest = [...success].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] || null;

  let storageUsed = 0;
  for (const sub of ["db", "files", "meta", "app", "docker"]) {
    const dir = path.join(config.backupRoot, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      try {
        storageUsed += fs.statSync(path.join(dir, f)).size;
      } catch {
        /* */
      }
    }
  }

  return {
    totalBackups: store.backups.length,
    databaseBackups: db.length,
    applicationBackups: app.length,
    latestBackup: latest,
    latestSuccessfulBackup: latestOk,
    oldestRetainedBackup: oldest,
    totalStorageBytes: storageUsed,
    filesystemDumpCount: fsScan.length,
    backupRoot: config.backupRoot,
  };
}
