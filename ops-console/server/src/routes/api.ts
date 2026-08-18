import { Router } from "express";
import { clearSessionCookie, login, logout, requireAuth, setSessionCookie, verifyCredentials } from "../auth.js";
import { config } from "../config.js";
import { GO_LIVE_KEYS, loadStore, mutateStore, appendAudit } from "../store.js";
import {
  backupSummary,
  createApplicationBackup,
  createDatabaseBackup,
  createDockerBackup,
  createPredeployBackup,
  latestDatabaseDump,
  restoreDatabase,
  scanFilesystemBackups,
} from "../ops/backups.js";
import { buildManualCommands, resolveRunnable } from "../ops/commands.js";
import { listContainers, productionStatus, restartContainer } from "../ops/docker.js";
import { runProductionDeploy } from "../ops/deploy.js";
import { cleanupExpired, retentionReport } from "../ops/retention.js";
import { runBash, platformToolingSummary } from "../ops/runner.js";

export const api = Router();

api.get("/meta", (_req, res) => {
  res.json({
    name: "Warin Backup & Deployment Console",
    storageBoundary: "ops-console-json-independent-of-warin-db",
    environment: config.environmentLabel,
    platform: process.platform,
    isEc2Layout: config.isEc2Layout,
    warinAppDir: config.warinAppDir,
    backupRoot: config.backupRoot,
    dataDir: config.dataDir,
    tooling: platformToolingSummary(),
    note: "This tool does not use the WARIN PostgreSQL database. Dual-platform: Windows (dev) + Ubuntu EC2 (prod).",
  });
});

api.post("/auth/login", (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const password = String(req.body?.password || "");
  const result = login(userId, password);
  if (!result.ok) {
    res.status(401).json({ error: result.error });
    return;
  }
  setSessionCookie(res, result.token);
  res.json({ ok: true, userId });
});

/** Re-check ops-console credentials for destructive actions (does not create a new session). */
api.post("/auth/verify", requireAuth, (req, res) => {
  const r = req as typeof req & { opsUser: string };
  const userId = String(req.body?.userId || "").trim();
  const password = String(req.body?.password || "");
  const result = verifyCredentials(userId, password);
  if (!result.ok) {
    appendAudit(r.opsUser, "auth.verify", "failed", { detail: "credential-gate", error: result.error });
    res.status(401).json({ error: result.error });
    return;
  }
  appendAudit(r.opsUser, "auth.verify", "success", { detail: "credential-gate" });
  res.json({ ok: true });
});

api.post("/auth/logout", requireAuth, (req, res) => {
  const r = req as typeof req & { opsUser: string; opsToken: string };
  logout(r.opsToken, r.opsUser);
  clearSessionCookie(res);
  res.json({ ok: true });
});

api.get("/auth/me", requireAuth, (req, res) => {
  const r = req as typeof req & { opsUser: string };
  res.json({ userId: r.opsUser, environment: config.environmentLabel });
});

api.get("/status", requireAuth, async (_req, res) => {
  try {
    res.json(await productionStatus());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/docker/containers", requireAuth, async (_req, res) => {
  try {
    res.json({ containers: await listContainers() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.post("/docker/restart", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    await restartContainer(String(req.body?.name || ""), Boolean(req.body?.confirm), r.opsUser);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/backups", requireAuth, (_req, res) => {
  const store = loadStore();
  res.json({
    records: store.backups,
    filesystem: scanFilesystemBackups(),
    summary: backupSummary(),
  });
});

api.post("/backups/database", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const record = await createDatabaseBackup(r.opsUser);
    res.json({ ok: true, record });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.post("/backups/application", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const record = await createApplicationBackup(r.opsUser);
    res.json({ ok: true, record });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.post("/backups/docker", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const record = await createDockerBackup(r.opsUser);
    res.json({ ok: true, record });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.post("/backups/predeploy", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const record = await createPredeployBackup(r.opsUser);
    res.json({ ok: true, record });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/backups/database/latest/download", requireAuth, (req, res) => {
  const r = req as typeof req & { opsUser: string };
  try {
    const dump = latestDatabaseDump();
    if (!dump) {
      appendAudit(r.opsUser, "backup.database.download", "failed", { error: "No database dump available" });
      res.status(404).json({ error: "No database dump is available. Create a database backup first." });
      return;
    }

    appendAudit(r.opsUser, "backup.database.download.started", "info", {
      detail: dump.name,
    });
    res.download(dump.path, dump.name, (error) => {
      if (!error) {
        appendAudit(r.opsUser, "backup.database.download.completed", "success", {
          detail: dump.name,
        });
        return;
      }

      appendAudit(r.opsUser, "backup.database.download.failed", "failed", {
        detail: dump.name,
        error: error.message,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Database dump download failed" });
      }
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    appendAudit(r.opsUser, "backup.database.download.failed", "failed", { error });
    res.status(500).json({ error });
  }
});

api.post("/backups/restore", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const userId = String(req.body?.userId || "").trim();
    const password = String(req.body?.password || "");
    const creds = verifyCredentials(userId, password);
    if (!creds.ok) {
      appendAudit(r.opsUser, "restore.database", "denied", { error: "Invalid credentials" });
      res.status(401).json({ error: "Invalid credentials — restore blocked" });
      return;
    }
    await restoreDatabase(r.opsUser, String(req.body?.path || ""), Boolean(req.body?.confirm));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/retention", requireAuth, (_req, res) => {
  res.json(retentionReport());
});

api.post("/retention/cleanup", requireAuth, (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    res.json(cleanupExpired(r.opsUser, Boolean(req.body?.confirm)));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/commands", requireAuth, (_req, res) => {
  res.json({ commands: buildManualCommands() });
});

api.post("/commands/run", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const id = String(req.body?.id || "");
    const cmd = resolveRunnable(id);
    if (!cmd) {
      appendAudit(r.opsUser, "command.run", "denied", { detail: id });
      res.status(403).json({ error: "Command not allowlisted for execution" });
      return;
    }
    appendAudit(r.opsUser, "command.run", "info", { detail: cmd.id });
    const result = await runBash(cmd.command, { timeoutMs: 60_000 });
    appendAudit(r.opsUser, "command.run", result.ok ? "success" : "failed", {
      detail: cmd.id,
      error: result.ok ? undefined : result.stderr,
    });
    res.json({ ok: result.ok, result });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/deployments", requireAuth, (_req, res) => {
  res.json({ deployments: loadStore().deployments });
});

api.post("/deploy", requireAuth, async (req, res) => {
  try {
    const r = req as typeof req & { opsUser: string };
    const body = req.body || {};
    const deployment = await runProductionDeploy(r.opsUser, {
      confirm: Boolean(body.confirm),
      runMigrate: Boolean(body.runMigrate),
      rebuildApi: body.rebuildApi !== false,
      rebuildSpa: body.rebuildSpa !== false,
      pull: body.pull !== false,
      targetRef: body.targetRef ? String(body.targetRef) : undefined,
    });
    res.json({ ok: true, deployment });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

api.get("/checklist", requireAuth, (_req, res) => {
  const store = loadStore();
  res.json({
    items: GO_LIVE_KEYS.map((key) => ({
      key,
      label: labelFor(key),
      checked: Boolean(store.checklist[key]),
    })),
  });
});

api.put("/checklist", requireAuth, (req, res) => {
  const r = req as typeof req & { opsUser: string };
  const key = String(req.body?.key || "");
  const checked = Boolean(req.body?.checked);
  if (!GO_LIVE_KEYS.includes(key as (typeof GO_LIVE_KEYS)[number])) {
    res.status(400).json({ error: "Invalid checklist key" });
    return;
  }
  mutateStore((s) => {
    s.checklist[key] = checked;
  });
  appendAudit(r.opsUser, "checklist.update", "info", { detail: `${key}=${checked}` });
  res.json({ ok: true });
});

api.get("/audit", requireAuth, (_req, res) => {
  res.json({ audit: loadStore().audit.slice(0, 500) });
});

function labelFor(key: string): string {
  const map: Record<string, string> = {
    gitVerified: "Correct Git branch/tag/commit verified",
    prodEnvVerified: "Production environment verified",
    configVerified: "Environment/configuration verified",
    dbConnectivity: "Database connectivity verified",
    dbBackupDone: "Database backup completed",
    appDockerBackupDone: "Application/Docker backup completed",
    diskSpaceOk: "Disk space checked",
    dockerHealthOk: "Docker health checked",
    portsSecurityOk: "Required ports/security configuration verified",
    sslVerified: "SSL/HTTPS verified",
    migrationsReviewed: "Database migrations reviewed",
    noDestructiveMigration: "No unexpected destructive migration",
    healthEndpointOk: "Application health endpoint verified",
    logsChecked: "Production logs checked",
    rollbackVersionIdentified: "Rollback version identified",
    restoreProcedureAvailable: "Backup restore procedure available",
    smokeTestDone: "Post-deployment smoke test completed",
  };
  return map[key] || key;
}
