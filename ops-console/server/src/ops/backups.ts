import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { appendAudit, loadStore, mutateStore, newId, type BackupRecord, type BackupType } from "../store.js";
import { runCommand, runDocker, runShellScript, resolveTarBin } from "./runner.js";
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

function failBackup(id: string, user: string, action: string, sha: string, err: string): never {
  mutateStore((s) => {
    const b = s.backups.find((x) => x.id === id);
    if (b) {
      b.status = "failed";
      b.completedAt = new Date().toISOString();
      b.error = err;
    }
  });
  appendAudit(user, action, "failed", { gitSha: sha, error: err });
  throw new Error(err);
}

function succeedBackup(id: string, location: string, size: number, status: BackupRecord["status"] = "success") {
  mutateStore((s) => {
    const b = s.backups.find((x) => x.id === id);
    if (b) {
      b.status = status;
      b.completedAt = new Date().toISOString();
      b.location = location;
      b.sizeBytes = size;
      b.restoreAvailable = true;
    }
  });
}

export async function createDatabaseBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const sha = await gitSha();
  const dumpName = `oneview_database_${stamp}_${sha}.dump`;
  const location = path.join(config.backupRoot, "db", dumpName);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("database", new Date(createdAt));
  const containerPath = `/backups/${dumpName}`;

  fs.mkdirSync(path.dirname(location), { recursive: true });

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

  const dump = await runDocker(
    ["exec", "oneview-postgres", "pg_dump", "-U", "admin", "-d", "oneview", "-F", "c", "-f", containerPath],
    { timeoutMs: 20 * 60 * 1000 },
  );
  if (!dump.ok) failBackup(id, user, "backup.database.failed", sha, dump.stderr || "pg_dump failed");

  const cp = await runDocker(["cp", `oneview-postgres:${containerPath}`, location], {
    timeoutMs: 10 * 60 * 1000,
  });
  await runDocker(["exec", "oneview-postgres", "rm", "-f", containerPath]);

  if (!cp.ok || !fs.existsSync(location)) {
    failBackup(id, user, "backup.database.failed", sha, cp.stderr || "docker cp failed");
  }

  succeedBackup(id, location, fileSize(location));
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
  const tmpInContainer = "/tmp/ops-files-backup.tar.gz";

  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.mkdirSync(path.dirname(metaGit), { recursive: true });
  fs.writeFileSync(metaGit, `git_sha=${sha}\nat=${createdAt}\n`, { mode: 0o600 });

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

  const tar = await runDocker(
    ["exec", "oneview-api", "sh", "-c", `cd /data/files && tar -czf ${tmpInContainer} .`],
    { timeoutMs: 20 * 60 * 1000 },
  );
  if (!tar.ok) failBackup(id, user, "backup.application.failed", sha, tar.stderr || "files tar failed");

  const cp = await runDocker(["cp", `oneview-api:${tmpInContainer}`, location], {
    timeoutMs: 10 * 60 * 1000,
  });
  await runDocker(["exec", "oneview-api", "rm", "-f", tmpInContainer]);

  if (!cp.ok || !fs.existsSync(location)) {
    failBackup(id, user, "backup.application.failed", sha, cp.stderr || "docker cp failed");
  }

  succeedBackup(id, location, fileSize(location));
  appendAudit(user, "backup.application.completed", "success", { gitSha: sha, detail: location });
  return loadStore().backups.find((x) => x.id === id)!;
}

export async function createDockerBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const sha = await gitSha();
  const archiveName = `docker_deploy_${stamp}_${sha}.tar.gz`;
  const location = path.join(config.backupRoot, "docker", archiveName);
  const manifest = path.join(config.backupRoot, "meta", `MANIFEST_docker_${stamp}_${sha}.txt`);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("docker", new Date(createdAt));

  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.mkdirSync(path.dirname(manifest), { recursive: true });

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

  const relEntries = [
    "docker-compose.yml",
    "scripts/ec2-backup.sh",
    "scripts/backup-postgres.sh",
    "scripts/restore-postgres.sh",
  ].filter((rel) => fs.existsSync(path.join(config.warinAppDir, rel)));

  if (fs.existsSync(path.join(config.warinAppDir, "infra", "nginx"))) {
    relEntries.push("infra/nginx");
  }

  if (relEntries.length === 0) {
    failBackup(id, user, "backup.docker.failed", sha, "No compose/scripts found to archive");
  }

  // Use system tar (Linux or Windows System32\tar.exe) — avoids powershell.exe PATH ENOENT on Windows
  const result = await runCommand(
    resolveTarBin(),
    ["-czf", location, "-C", config.warinAppDir, ...relEntries],
    { timeoutMs: 10 * 60 * 1000 },
  );

  if (!result.ok || !fs.existsSync(location) || fileSize(location) <= 0) {
    failBackup(id, user, "backup.docker.failed", sha, result.stderr || result.stdout || "Docker/config backup failed");
  }

  succeedBackup(id, location, fileSize(location));
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

  const useScript = fs.existsSync(scriptPath);
  let result: { ok: boolean; stderr: string; stdout: string };

  if (useScript) {
    result = await runShellScript(scriptPath, ["predeploy"], {
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
    try {
      await createDatabaseBackup(user);
      await createApplicationBackup(user);
      await createDockerBackup(user);
      result = { ok: true, stdout: "sequential predeploy", stderr: "" };
    } catch (e) {
      result = { ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
    }
  }

  const dbDir = path.join(config.backupRoot, "db");
  let newest = "";
  let newestMtime = 0;
  if (fs.existsSync(dbDir)) {
    for (const f of fs.readdirSync(dbDir)) {
      if (!f.endsWith(".dump")) continue;
      const st = fs.statSync(path.join(dbDir, f));
      if (st.mtimeMs > newestMtime) {
        newestMtime = st.mtimeMs;
        newest = path.join(dbDir, f);
      }
    }
  }

  if (!result.ok) {
    failBackup(id, user, "backup.predeploy.failed", sha, result.stderr || "Pre-deploy backup failed");
  }

  const location = newest || path.join(config.backupRoot, "db");
  succeedBackup(id, location, newest ? fileSize(newest) : 0, "verified");
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

  const cp = await runDocker(["cp", resolved, "oneview-postgres:/backups/restore.dump"], {
    timeoutMs: 10 * 60 * 1000,
  });
  if (!cp.ok) {
    appendAudit(user, "restore.database.failed", "failed", { error: cp.stderr });
    throw new Error(cp.stderr || "docker cp failed");
  }

  const restore = await runDocker(
    ["exec", "oneview-postgres", "pg_restore", "-U", "admin", "-d", "oneview", "-c", "/backups/restore.dump"],
    { timeoutMs: 30 * 60 * 1000 },
  );
  if (!restore.ok && /fatal/i.test(restore.stderr)) {
    appendAudit(user, "restore.database.failed", "failed", { error: restore.stderr });
    throw new Error(restore.stderr || "Restore failed");
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

export function latestDatabaseDump(): { path: string; name: string; sizeBytes: number; createdAt: string } | null {
  const latest = scanFilesystemBackups()[0];
  if (!latest.location) return null;

  const resolved = assertPathInsideBackupRoot(latest.location);
  if (!resolved.endsWith(".dump") || !fs.existsSync(resolved)) return null;
  const realPath = assertPathInsideBackupRoot(fs.realpathSync(resolved));

  const stat = fs.statSync(realPath);
  if (!stat.isFile()) return null;

  return {
    path: realPath,
    name: path.basename(realPath),
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
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
