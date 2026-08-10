import { config, posixPath } from "../config.js";
import { appendAudit, mutateStore, newId, loadStore } from "../store.js";
import { createPredeployBackup } from "./backups.js";
import { productionStatus } from "./docker.js";
import { runBash, runCommand, runCompose, runDocker, resolveCurlBin } from "./runner.js";

export interface DeployOptions {
  confirm: boolean;
  runMigrate: boolean;
  rebuildApi: boolean;
  rebuildSpa: boolean;
  pull: boolean;
  targetRef?: string;
}

export async function runProductionDeploy(user: string, opts: DeployOptions) {
  if (!opts.confirm) throw new Error("Confirmation required for production deployment");

  const id = newId("dep");
  const before = await productionStatus();
  mutateStore((s) => {
    s.deployments.unshift({
      id,
      at: new Date().toISOString(),
      user,
      status: "running",
      fromSha: before.git.sha,
      steps: [],
    });
  });
  appendAudit(user, "deployment.started", "info", { gitSha: before.git.shortSha });

  const step = async (name: string, fn: () => Promise<string | void>) => {
    try {
      const detail = (await fn()) || "ok";
      mutateStore((s) => {
        const d = s.deployments.find((x) => x.id === id);
        d?.steps.push({ name, status: "success", detail: String(detail).slice(0, 2000) });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      mutateStore((s) => {
        const d = s.deployments.find((x) => x.id === id);
        d?.steps.push({ name, status: "failed", detail: msg });
        if (d) {
          d.status = "failed";
          d.error = msg;
        }
      });
      appendAudit(user, "deployment.failed", "failed", { error: msg });
      throw e;
    }
  };

  await step("Check current production status", async () => {
    return `sha=${before.git.shortSha} branch=${before.git.branch} containers=${before.containers.length} platform=${process.platform}`;
  });

  await step("Verify target Git branch/tag/commit", async () => {
    if (opts.targetRef) {
      const r = await runCommand("git", ["-C", config.warinAppDir, "rev-parse", "--verify", opts.targetRef]);
      if (!r.ok) throw new Error(`Invalid ref: ${opts.targetRef}`);
      return r.stdout.trim();
    }
    return before.git.branch;
  });

  let backupId: string | undefined;
  await step("Create pre-deployment backup", async () => {
    const b = await createPredeployBackup(user);
    backupId = b.id;
    mutateStore((s) => {
      const d = s.deployments.find((x) => x.id === id);
      if (d) d.backupId = b.id;
    });
    if (b.status !== "verified" && b.status !== "success") {
      throw new Error("Pre-deploy backup did not succeed");
    }
    return b.location;
  });

  await step("Verify backup", async () => {
    const store = loadStore();
    const b = store.backups.find((x) => x.id === backupId);
    if (!b || (b.status !== "verified" && b.status !== "success")) {
      throw new Error("Backup verification failed — deployment blocked");
    }
    return `backupId=${b.id} status=${b.status}`;
  });

  if (opts.pull) {
    await step("Pull latest approved code", async () => {
      const branch = (opts.targetRef || "main").replace(/^origin\//, "");
      const r = await runCommand("git", ["-C", config.warinAppDir, "pull", "origin", branch], {
        timeoutMs: 10 * 60 * 1000,
      });
      if (!r.ok) throw new Error(r.stderr || "git pull failed");
      return r.stdout.slice(0, 500);
    });
  }

  if (opts.rebuildApi) {
    await step("Build / deploy API containers", async () => {
      const r = await runCompose(["up", "-d", "--build", "api", "worker"], {
        cwd: config.warinAppDir,
        timeoutMs: 30 * 60 * 1000,
      });
      if (!r.ok) throw new Error(r.stderr || "compose build failed");
      return "api worker rebuilt";
    });
  }

  if (opts.runMigrate) {
    await step("Run database migration", async () => {
      const r = await runCompose(
        ["exec", "-T", "api", "npx", "prisma", "migrate", "deploy", "--schema=/app/prisma/schema.prisma"],
        { cwd: config.warinAppDir, timeoutMs: 20 * 60 * 1000 },
      );
      if (!r.ok) throw new Error(r.stderr || "migrate failed");
      await runCompose(["restart", "api", "worker"], { cwd: config.warinAppDir });
      return "migrate deploy ok";
    });
  }

  if (opts.rebuildSpa) {
    await step("Build and publish SPA", async () => {
      const web = posixPath(config.sharedWebPath);
      // POSIX snippet — runs under /bin/bash on EC2 and Git Bash on Windows
      const r = await runBash(
        `export VITE_API_BASE_URL="${config.viteApiBaseUrl}" && npx vite build && test -f dist/index.html && mkdir -p "${web}" && rm -rf "${web}"/* && cp -a dist/. "${web}/"`,
        { cwd: config.warinAppDir, timeoutMs: 20 * 60 * 1000 },
      );
      if (!r.ok) throw new Error(r.stderr || "SPA build failed");
      return `published to ${web}`;
    });
  }

  await step("Verify container health", async () => {
    const st = await productionStatus();
    const bad = st.containers.filter((c) =>
      ["Unhealthy", "Failed", "Restarting"].includes(c.statusLabel),
    );
    if (bad.length) throw new Error(`Unhealthy: ${bad.map((c) => c.name).join(", ")}`);
    return `${st.containers.length} containers checked`;
  });

  await step("Verify application health", async () => {
    const curl = resolveCurlBin();
    let r = await runCommand(curl, ["-sf", "http://127.0.0.1:8080/api/v1/health"]);
    if (!r.ok) {
      r = await runCommand(curl, ["-sf", "http://127.0.0.1:3001/api/v1/health"]);
    }
    if (!r.ok || (!r.stdout.includes("ok") && !r.stdout.includes("degraded") && !r.stdout.includes("status"))) {
      throw new Error(r.stderr || "Health check failed");
    }
    return r.stdout.slice(0, 300);
  });

  await step("Check production logs", async () => {
    const r = await runDocker(["logs", "--tail", "30", "oneview-api"]);
    return (r.stdout || r.stderr).slice(0, 500);
  });

  const after = await productionStatus();
  mutateStore((s) => {
    const d = s.deployments.find((x) => x.id === id);
    if (d) {
      d.status = "success";
      d.toSha = after.git.sha;
      d.steps.push({ name: "Complete deployment", status: "success", detail: after.git.shortSha });
    }
  });
  appendAudit(user, "deployment.completed", "success", { gitSha: after.git.shortSha });
  return loadStore().deployments.find((x) => x.id === id);
}
