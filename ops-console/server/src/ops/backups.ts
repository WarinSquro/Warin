import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { appendAudit, loadStore, mutateStore, newId, type BackupRecord, type BackupType } from "../store.js";
import { runCommand, runDocker, runShellScript, resolveTarBin } from "./runner.js";
import {
  assertDownloadableBackupArtifact,
  assertPathInsideBackupRoot,
  type DownloadableBackupKind,
} from "./commands.js";

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
  const tarName = `warin_application_${stamp}_${sha}.tar.gz`;
  const location = path.join(config.backupRoot, "app", tarName);
  const metaGit = path.join(config.backupRoot, "meta", `git_application_${stamp}_${sha}.txt`);
  const staging = path.join(config.backupRoot, "meta", `staging_application_${stamp}_${sha}`);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("application", new Date(createdAt));
  const tmpInContainer = "/tmp/ops-files-backup.tar.gz";

  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.mkdirSync(path.dirname(metaGit), { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, "web"), { recursive: true });
  fs.mkdirSync(path.join(staging, "files"), { recursive: true });

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

  try {
    const parts: string[] = [];
    let spaBytes = 0;
    let filesBytes = 0;

    // Live published SPA (host Nginx root) — primary WARIN application artifact on EC2
    if (fs.existsSync(config.sharedWebPath)) {
      copyDirectoryRecursive(config.sharedWebPath, path.join(staging, "web"));
      spaBytes = directorySize(path.join(staging, "web"));
      parts.push(`web=${config.sharedWebPath} (${spaBytes} bytes)`);
    } else {
      parts.push(`web=missing:${config.sharedWebPath}`);
    }

    // Uploaded files volume via API container (may be empty)
    const filesArchive = path.join(staging, "files_volume.tar.gz");
    const tar = await runDocker(
      ["exec", "oneview-api", "sh", "-c", `cd /data/files && tar -czf ${tmpInContainer} .`],
      { timeoutMs: 20 * 60 * 1000 },
    );
    if (tar.ok) {
      const cp = await runDocker(["cp", `oneview-api:${tmpInContainer}`, filesArchive], {
        timeoutMs: 10 * 60 * 1000,
      });
      await runDocker(["exec", "oneview-api", "rm", "-f", tmpInContainer]);
      if (cp.ok && fs.existsSync(filesArchive) && fileSize(filesArchive) > 32) {
        filesBytes = fileSize(filesArchive);
        parts.push(`files_volume=/data/files (${filesBytes} bytes)`);
      } else {
        try {
          fs.unlinkSync(filesArchive);
        } catch {
          /* */
        }
        fs.writeFileSync(
          path.join(staging, "files", "README.txt"),
          "Uploaded files volume was empty at backup time.\n",
          { mode: 0o600 },
        );
        parts.push("files_volume=empty");
      }
    } else {
      await runDocker(["exec", "oneview-api", "rm", "-f", tmpInContainer]);
      fs.writeFileSync(
        path.join(staging, "files", "README.txt"),
        `Uploaded files volume unavailable: ${tar.stderr || "oneview-api exec failed"}\n`,
        { mode: 0o600 },
      );
      parts.push("files_volume=unavailable");
    }

    const manifestBody =
      [
        `type=application`,
        `git_sha=${sha}`,
        `at=${createdAt}`,
        `spa_root=${config.sharedWebPath}`,
        `spa_bytes=${spaBytes}`,
        `files_bytes=${filesBytes}`,
        ...parts.map((p) => `part=${p}`),
        `note=Includes published SPA (shared/web) plus uploaded files volume when present`,
      ].join("\n") + "\n";
    fs.writeFileSync(path.join(staging, "MANIFEST.txt"), manifestBody, { mode: 0o600 });
    fs.writeFileSync(metaGit, manifestBody, { mode: 0o600 });

    if (spaBytes <= 0 && filesBytes <= 0) {
      failBackup(
        id,
        user,
        "backup.application.failed",
        sha,
        "Application backup is empty — published SPA and uploaded files are both missing/empty",
      );
    }

    const pack = await runCommand(
      resolveTarBin(),
      ["-czf", location, "-C", staging, "."],
      { timeoutMs: 20 * 60 * 1000 },
    );
    if (!pack.ok || !fs.existsSync(location) || fileSize(location) <= 0) {
      failBackup(id, user, "backup.application.failed", sha, pack.stderr || pack.stdout || "application tar failed");
    }

    succeedBackup(id, location, fileSize(location));
    appendAudit(user, "backup.application.completed", "success", {
      gitSha: sha,
      detail: `${location} spa=${spaBytes} files=${filesBytes}`,
    });
    return loadStore().backups.find((x) => x.id === id)!;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function copyDirectoryRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function directorySize(dir: string): number {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(full);
    else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        /* */
      }
    }
  }
  return total;
}

export async function createDockerBackup(user: string): Promise<BackupRecord> {
  const id = newId("bak");
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const sha = await gitSha();
  const archiveName = `docker_deploy_${stamp}_${sha}.tar.gz`;
  const location = path.join(config.backupRoot, "docker", archiveName);
  const manifest = path.join(config.backupRoot, "meta", `MANIFEST_docker_${stamp}_${sha}.txt`);
  const staging = path.join(config.backupRoot, "meta", `staging_docker_${stamp}_${sha}`);
  const createdAt = new Date().toISOString();
  const exp = expiresFor("docker", new Date(createdAt));

  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

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

  try {
    const included: string[] = [];
    const repoEntries = [
      "docker-compose.yml",
      "scripts",
      "infra",
      "prisma",
      "package.json",
      "package-lock.json",
      "apps/Dockerfile",
      "apps/README.md",
    ];

    for (const rel of repoEntries) {
      const src = path.join(config.warinAppDir, rel);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(staging, "repo", rel);
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        copyDirectoryRecursive(src, dest);
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      included.push(`repo/${rel}`);
    }

    // Host Nginx site config (live EC2) — not always in git
    const hostNginxCandidates = [
      "/etc/nginx/sites-available/warin",
      "/etc/nginx/sites-enabled/warin",
    ];
    for (const nginxPath of hostNginxCandidates) {
      if (!fs.existsSync(nginxPath)) continue;
      const destDir = path.join(staging, "host-nginx");
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, path.basename(nginxPath));
      fs.copyFileSync(nginxPath, dest);
      included.push(`host-nginx/${path.basename(nginxPath)}`);
      break;
    }

    // Runtime docker inventory (text only — not image layers)
    const ps = await runDocker(["ps", "-a", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"], {
      timeoutMs: 60_000,
    });
    const images = await runDocker(
      ["images", "--format", "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}"],
      { timeoutMs: 60_000 },
    );
    const composeConfig = await runDocker(["compose", "config"], {
      cwd: config.warinAppDir,
      timeoutMs: 60_000,
    });
    fs.writeFileSync(
      path.join(staging, "docker-ps.txt"),
      (ps.ok ? ps.stdout : `ERROR\n${ps.stderr}`) + "\n",
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(staging, "docker-images.txt"),
      (images.ok ? images.stdout : `ERROR\n${images.stderr}`) + "\n",
      { mode: 0o600 },
    );
    if (composeConfig.ok && composeConfig.stdout.trim()) {
      fs.writeFileSync(path.join(staging, "docker-compose.resolved.yml"), composeConfig.stdout, {
        mode: 0o600,
      });
      included.push("docker-compose.resolved.yml");
    }
    included.push("docker-ps.txt", "docker-images.txt");

    const manifestBody =
      [
        `type=docker`,
        `git_sha=${sha}`,
        `at=${createdAt}`,
        `compose=${path.join(config.warinAppDir, "docker-compose.yml")}`,
        `env_copy=${envCopied ? envCopy : "none"}`,
        `included=${included.join(",")}`,
        `note=.env content never exposed via ops-console API; Docker images themselves are not archived (rebuild from Git)`,
      ].join("\n") + "\n";
    fs.writeFileSync(manifest, manifestBody, { mode: 0o600 });
    fs.writeFileSync(path.join(staging, "MANIFEST.txt"), manifestBody, { mode: 0o600 });
    // Keep .env only in meta/ on disk — never inside the downloadable archive

    if (included.length === 0) {
      failBackup(id, user, "backup.docker.failed", sha, "No compose/scripts/infra found to archive");
    }

    const result = await runCommand(
      resolveTarBin(),
      ["-czf", location, "-C", staging, "."],
      { timeoutMs: 15 * 60 * 1000 },
    );

    if (!result.ok || !fs.existsSync(location) || fileSize(location) <= 0) {
      failBackup(id, user, "backup.docker.failed", sha, result.stderr || result.stdout || "Docker/config backup failed");
    }

    succeedBackup(id, location, fileSize(location));
    appendAudit(user, "backup.docker.completed", "success", {
      gitSha: sha,
      detail: `${location} bytes=${fileSize(location)}`,
    });
    return loadStore().backups.find((x) => x.id === id)!;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
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
  await runPgRestoreFromHostFile(user, resolved, "restore.database");
}

/**
 * Restore a browser-uploaded .dump into this machine's oneview-postgres (local Docker).
 * Blocked on EC2 layout so production cannot be overwritten via upload.
 */
export async function restoreUploadedDatabaseDump(
  user: string,
  uploadedPath: string,
  originalName: string,
  confirm: boolean,
): Promise<void> {
  if (!confirm) throw new Error("Confirmation required for database restore");
  if (config.isEc2Layout) {
    throw new Error(
      "Upload restore is only available when ops-console runs on your laptop (local Docker). On EC2, use the server dump list restore instead.",
    );
  }
  if (!uploadedPath || !fs.existsSync(uploadedPath)) throw new Error("Uploaded dump not found");
  const safeName = path.basename(originalName || "upload.dump");
  if (!safeName.toLowerCase().endsWith(".dump")) throw new Error("Only .dump files allowed");

  const uploadDir = path.join(config.dataDir, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const staged = path.join(uploadDir, `local_restore_${Date.now()}_${safeName.replace(/[^\w.\-]+/g, "_")}`);
  try {
    fs.copyFileSync(uploadedPath, staged);
    await runPgRestoreFromHostFile(user, staged, "restore.database.upload", safeName);
  } finally {
    try {
      fs.unlinkSync(staged);
    } catch {
      /* */
    }
    try {
      fs.unlinkSync(uploadedPath);
    } catch {
      /* */
    }
  }
}

async function runPgRestoreFromHostFile(
  user: string,
  hostDumpPath: string,
  auditAction: string,
  detailName?: string,
): Promise<void> {
  const sha = await gitSha();
  const detail = detailName || path.basename(hostDumpPath);
  appendAudit(user, `${auditAction}.started`, "info", { gitSha: sha, detail });

  const cp = await runDocker(["cp", hostDumpPath, "oneview-postgres:/backups/restore.dump"], {
    timeoutMs: 10 * 60 * 1000,
  });
  if (!cp.ok) {
    appendAudit(user, `${auditAction}.failed`, "failed", { error: cp.stderr });
    throw new Error(cp.stderr || "docker cp failed");
  }

  const restore = await runDocker(
    [
      "exec",
      "oneview-postgres",
      "pg_restore",
      "-U",
      "admin",
      "-d",
      "oneview",
      "-c",
      "--if-exists",
      "/backups/restore.dump",
    ],
    { timeoutMs: 30 * 60 * 1000 },
  );
  if (!restore.ok && /fatal/i.test(restore.stderr)) {
    appendAudit(user, `${auditAction}.failed`, "failed", { error: restore.stderr });
    throw new Error(restore.stderr || "Restore failed");
  }

  appendAudit(user, `${auditAction}.completed`, "success", { gitSha: sha, detail });
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

export type BackupArtifactInfo = {
  kind: DownloadableBackupKind;
  path: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
};

function scanBackupDirForLatest(
  kind: DownloadableBackupKind,
): BackupArtifactInfo | null {
  const subdirs =
    kind === "database" ? ["db"] : kind === "application" ? ["app", "files"] : ["docker"];
  const ext = kind === "database" ? ".dump" : ".tar.gz";

  let newest: BackupArtifactInfo | null = null;
  let newestMtime = 0;
  for (const subdir of subdirs) {
    const dir = path.join(config.backupRoot, subdir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(ext)) continue;
      // Prefer meaningful application archives; skip tiny legacy empty files_*.tar.gz when newer app/ exists
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || st.mtimeMs <= newestMtime) continue;
        const resolved = assertDownloadableBackupArtifact(full, kind);
        const realPath = assertDownloadableBackupArtifact(fs.realpathSync(resolved), kind);
        newestMtime = st.mtimeMs;
        newest = {
          kind,
          path: realPath,
          name: path.basename(realPath),
          sizeBytes: st.size,
          createdAt: st.mtime.toISOString(),
        };
      } catch {
        /* skip unsafe / missing */
      }
    }
  }
  return newest;
}

function latestFromStoreRecords(kind: DownloadableBackupKind): BackupArtifactInfo | null {
  const store = loadStore();
  const candidates = store.backups
    .filter((b) => b.type === kind && (b.status === "success" || b.status === "verified") && b.location)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const rec of candidates) {
    try {
      if (!fs.existsSync(rec.location)) continue;
      const resolved = assertDownloadableBackupArtifact(rec.location, kind);
      const realPath = assertDownloadableBackupArtifact(fs.realpathSync(resolved), kind);
      const st = fs.statSync(realPath);
      if (!st.isFile()) continue;
      return {
        kind,
        path: realPath,
        name: path.basename(realPath),
        sizeBytes: st.size,
        createdAt: rec.completedAt || rec.createdAt || st.mtime.toISOString(),
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Newest downloadable artifact for database / application / docker backups. */
export function latestBackupArtifact(kind: DownloadableBackupKind): BackupArtifactInfo | null {
  const fromFs = scanBackupDirForLatest(kind);
  const fromStore = latestFromStoreRecords(kind);
  if (fromFs && fromStore) {
    return fromFs.createdAt >= fromStore.createdAt ? fromFs : fromStore;
  }
  return fromFs || fromStore;
}

/** Alias for latestBackupArtifact("database"). */
export function latestDatabaseDump(): BackupArtifactInfo | null {
  return latestBackupArtifact("database");
}

export function latestDownloadableArtifacts(): Record<
  DownloadableBackupKind,
  Omit<BackupArtifactInfo, "path"> | null
> {
  const mapKind = (kind: DownloadableBackupKind) => {
    const a = latestBackupArtifact(kind);
    if (!a) return null;
    return { kind: a.kind, name: a.name, sizeBytes: a.sizeBytes, createdAt: a.createdAt };
  };
  return {
    database: mapKind("database"),
    application: mapKind("application"),
    docker: mapKind("docker"),
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
