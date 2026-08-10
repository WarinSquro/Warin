import { runBash, runCommand, runDocker, resolveCurlBin, resolvePowerShellBin } from "./runner.js";
import { config, isWindows } from "../config.js";

export interface ContainerInfo {
  name: string;
  image: string;
  imageTag: string;
  state: string;
  health: string;
  statusLabel: string;
  ports: string;
  startedAt?: string;
  uptime?: string;
  restartCount?: number;
}

function classify(state: string, health: string, status: string): string {
  const s = (state || "").toLowerCase();
  const h = (health || "").toLowerCase();
  const st = (status || "").toLowerCase();
  if (h === "healthy") return "Healthy";
  if (h === "unhealthy") return "Unhealthy";
  if (s === "restarting" || st.includes("restarting")) return "Restarting";
  if (s === "exited" || s === "dead" || st.includes("exited")) return "Stopped";
  if (s === "running") return "Running";
  if (st.includes("failed") || s === "dead") return "Failed";
  return state || status || "Unknown";
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const ps = await runDocker([
    "ps",
    "-a",
    "--format",
    "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.State}}",
  ]);
  if (!ps.ok) {
    throw new Error(ps.stderr || "Docker not available");
  }
  const lines = ps.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ContainerInfo[] = [];

  for (const line of lines) {
    const [id, name, image, status, ports, state] = line.split("\t");
    let health = "none";
    let startedAt: string | undefined;
    let restartCount: number | undefined;
    const inspect = await runDocker([
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}\t{{.State.StartedAt}}\t{{.RestartCount}}\t{{.Config.Image}}",
      id,
    ]);
    if (inspect.ok) {
      const [h, started, rc, imgFull] = inspect.stdout.trim().split("\t");
      health = h || "none";
      startedAt = started;
      restartCount = Number(rc) || 0;
      const imageRef = imgFull || image;
      const tag = imageRef.includes(":") ? imageRef.split(":").pop() || "latest" : "latest";
      out.push({
        name,
        image: imageRef,
        imageTag: tag || "latest",
        state: state || "",
        health,
        statusLabel: classify(state, health, status),
        ports: ports || "",
        startedAt,
        uptime: status,
        restartCount,
      });
    } else {
      const tag = image.includes(":") ? image.split(":").pop() || "latest" : "latest";
      out.push({
        name,
        image,
        imageTag: tag,
        state: state || "",
        health: "none",
        statusLabel: classify(state, "none", status),
        ports: ports || "",
        uptime: status,
      });
    }
  }
  return out;
}

export async function productionStatus() {
  const sha = await runCommand("git", ["-C", config.warinAppDir, "rev-parse", "HEAD"]);
  const short = await runCommand("git", ["-C", config.warinAppDir, "rev-parse", "--short", "HEAD"]);
  const branch = await runCommand("git", ["-C", config.warinAppDir, "rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await runCommand("git", ["-C", config.warinAppDir, "status", "-sb"]);
  let containers: ContainerInfo[] = [];
  let dockerError: string | undefined;
  try {
    containers = await listContainers();
  } catch (e) {
    dockerError = e instanceof Error ? e.message : String(e);
  }
  const disk = isWindows
    ? await runCommand(resolvePowerShellBin(), [
        "-NoProfile",
        "-Command",
        "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | Format-Table | Out-String",
      ])
    : await runBash("df -h . 2>/dev/null || df -h");
  const curl = resolveCurlBin();
  let health = await runCommand(curl, ["-sf", "http://127.0.0.1:8080/api/v1/health"]);
  if (!health.ok) {
    health = await runCommand(curl, ["-sf", "http://127.0.0.1:3001/api/v1/health"]);
  }
  return {
    environment: config.environmentLabel,
    platform: process.platform,
    isEc2Layout: config.isEc2Layout,
    warinAppDir: config.warinAppDir,
    backupRoot: config.backupRoot,
    git: {
      sha: sha.ok ? sha.stdout.trim() : "unknown",
      shortSha: short.ok ? short.stdout.trim() : "unknown",
      branch: branch.ok ? branch.stdout.trim() : "unknown",
      status: status.ok ? status.stdout.trim() : status.stderr,
    },
    containers,
    dockerError,
    disk: disk.stdout || disk.stderr,
    appHealthRaw: health.stdout || health.stderr || '{"status":"unreachable"}',
  };
}

export async function restartContainer(name: string, confirm: boolean, user: string) {
  const allowed = new Set([
    "oneview-api",
    "oneview-worker",
    "oneview-postgres",
    "oneview-redis",
    "oneview-nginx",
    "oneview-mailpit",
  ]);
  if (!confirm) throw new Error("Confirmation required");
  if (!allowed.has(name)) throw new Error("Container not in allowlist");
  const { appendAudit } = await import("../store.js");
  appendAudit(user, "container.restart", "info", { detail: name });
  const r = await runDocker(["restart", name]);
  if (!r.ok) {
    appendAudit(user, "container.restart", "failed", { detail: name, error: r.stderr });
    throw new Error(r.stderr || "Restart failed");
  }
  appendAudit(user, "container.restart", "success", { detail: name });
  return r;
}
