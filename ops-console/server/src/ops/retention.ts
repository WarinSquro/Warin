import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { loadStore, mutateStore, type BackupRecord } from "../store.js";
import { appendAudit } from "../store.js";

export function retentionReport() {
  const store = loadStore();
  const now = Date.now();
  const retained: BackupRecord[] = [];
  const eligible: BackupRecord[] = [];
  const expired: BackupRecord[] = [];

  for (const b of store.backups) {
    if (b.status === "running") {
      retained.push(b);
      continue;
    }
    const exp = b.expiresAt ? new Date(b.expiresAt).getTime() : null;
    if (exp && exp < now) {
      expired.push(b);
      eligible.push(b);
    } else {
      retained.push(b);
    }
  }

  // Also classify filesystem dumps by age vs policy
  const policy = store.retention;
  const fsEligible: { path: string; reason: string }[] = [];
  const dbDir = path.join(config.backupRoot, "db");
  if (fs.existsSync(dbDir)) {
    const dumps = fs
      .readdirSync(dbDir)
      .filter((f) => f.endsWith(".dump"))
      .map((f) => {
        const full = path.join(dbDir, f);
        return { full, f, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    const hourlyCutoff = now - policy.hourlyHours * 3600_000;
    const dailyCutoff = now - policy.dailyDays * 86400_000;
    let predeployCount = 0;
    for (const d of dumps) {
      if (d.f.includes("hourly") && d.mtime < hourlyCutoff) {
        fsEligible.push({ path: d.full, reason: `hourly older than ${policy.hourlyHours}h` });
      } else if (d.f.includes("predeploy")) {
        predeployCount += 1;
        if (predeployCount > policy.predeployKeep) {
          fsEligible.push({ path: d.full, reason: `beyond last ${policy.predeployKeep} predeploy` });
        }
      } else if (d.f.includes("daily") && d.mtime < dailyCutoff) {
        fsEligible.push({ path: d.full, reason: `daily older than ${policy.dailyDays}d` });
      }
    }
  }

  return {
    policy,
    retainedCount: retained.length,
    eligibleCleanupCount: eligible.length + fsEligible.length,
    expiredCount: expired.length,
    retained: retained.slice(0, 100),
    eligibleForCleanup: [...eligible.map((b) => ({ id: b.id, location: b.location, expiresAt: b.expiresAt })), ...fsEligible],
    note: "Never auto-deletes backups still within retention. Cleanup requires confirm=true.",
  };
}

export function cleanupExpired(user: string, confirm: boolean) {
  if (!confirm) throw new Error("Confirmation required to delete expired backups");
  const report = retentionReport();
  const deleted: string[] = [];
  const now = Date.now();

  mutateStore((s) => {
    s.backups = s.backups.filter((b) => {
      if (!b.expiresAt) return true;
      if (new Date(b.expiresAt).getTime() >= now) return true;
      // only remove metadata if file gone or we delete file
      try {
        if (fs.existsSync(b.location) && fs.statSync(b.location).isFile()) {
          fs.unlinkSync(b.location);
        }
      } catch {
        /* */
      }
      deleted.push(b.location);
      return false;
    });
  });

  for (const item of report.eligibleForCleanup) {
    if ("path" in item && typeof (item as { path?: string }).path === "string") {
      const p = (item as { path: string }).path;
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          deleted.push(p);
        }
      } catch {
        /* */
      }
    }
  }

  appendAudit(user, "backup.retention.cleanup", "success", { detail: `deleted=${deleted.length}` });
  return { deleted };
}
