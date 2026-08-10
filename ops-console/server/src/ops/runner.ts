import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isWindows, posixPath } from "../config.js";
import { redactSecrets } from "../store.js";

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string;
}

function winSystemRoot(): string {
  return process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
}

function firstExisting(candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

/** Absolute PowerShell — Windows only. */
export function resolvePowerShellBin(): string {
  return (
    firstExisting([
      process.env.OPS_POWERSHELL,
      path.join(winSystemRoot(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      path.join(winSystemRoot(), "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ]) || "powershell.exe"
  );
}

/**
 * Prefer real bash everywhere so the same POSIX snippets work on Ubuntu EC2 and Windows (Git Bash).
 */
export function resolveBashBin(): string {
  if (isWindows) {
    return (
      firstExisting([
        process.env.OPS_BASH,
        path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
        path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "usr", "bin", "bash.exe"),
      ]) || "bash.exe"
    );
  }
  return firstExisting([process.env.OPS_BASH, "/bin/bash", "/usr/bin/bash"]) || "bash";
}

export function resolveTarBin(): string {
  if (isWindows) {
    return (
      firstExisting([process.env.OPS_TAR, path.join(winSystemRoot(), "System32", "tar.exe")]) || "tar.exe"
    );
  }
  return firstExisting([process.env.OPS_TAR, "/usr/bin/tar", "/bin/tar"]) || "tar";
}

export function resolveCurlBin(): string {
  if (isWindows) {
    return (
      firstExisting([process.env.OPS_CURL, path.join(winSystemRoot(), "System32", "curl.exe")]) || "curl.exe"
    );
  }
  return firstExisting([process.env.OPS_CURL, "/usr/bin/curl", "/bin/curl"]) || "curl";
}

/** Docker CLI: Desktop path on Windows; /usr/bin/docker on Ubuntu EC2. */
export function resolveDockerBin(): string {
  if (isWindows) {
    return (
      firstExisting([
        process.env.DOCKER_BIN,
        path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "Docker",
          "Docker",
          "resources",
          "bin",
          "docker.exe",
        ),
        path.join(
          process.env["ProgramFiles(x86)"] || "",
          "Docker",
          "Docker",
          "resources",
          "bin",
          "docker.exe",
        ),
      ]) || "docker.exe"
    );
  }
  return firstExisting([process.env.DOCKER_BIN, "/usr/bin/docker", "/usr/local/bin/docker"]) || "docker";
}

function opsEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  if (isWindows) {
    if (!env.DOCKER_HOST || env.DOCKER_HOST.includes("unix://")) {
      delete env.DOCKER_HOST;
    }
    const dockerDir = path.dirname(resolveDockerBin());
    const system32 = path.join(winSystemRoot(), "System32");
    env.PATH = `${dockerDir}${path.delimiter}${system32}${path.delimiter}${env.PATH || ""}`;
  } else {
    // systemd units often have a slim PATH — keep Docker/CE tools reachable
    const extras = ["/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin"];
    env.PATH = [...extras, env.PATH || ""].filter(Boolean).join(path.delimiter);
  }
  return env;
}

export function runCommand(
  command: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  const started = Date.now();
  const display = `${command} ${args.join(" ")}`.trim();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts?.cwd,
      env: opsEnv(opts?.env),
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer =
      opts?.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGTERM");
            stderr += "\n[ops-console] command timed out";
          }, opts.timeoutMs)
        : null;

    child.stdout.on("data", (d) => {
      stdout += String(d);
      if (stdout.length > 500_000) stdout = stdout.slice(-400_000);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 500_000) stderr = stderr.slice(-400_000);
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout: redactSecrets(stdout) || "",
        stderr: redactSecrets(`${stderr}\n${err.message}`) || err.message,
        durationMs: Date.now() - started,
        command: display,
      });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: redactSecrets(stdout) || "",
        stderr: redactSecrets(stderr) || "",
        durationMs: Date.now() - started,
        command: display,
      });
    });
  });
}

export function runDocker(
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return runCommand(resolveDockerBin(), args, opts);
}

/** Compose V2 plugin (`docker compose`) — Ubuntu Docker CE + Docker Desktop. */
export function runCompose(
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return runDocker(["compose", ...args], opts);
}

/**
 * Run a POSIX shell snippet with bash -lc.
 * Ubuntu: /bin/bash. Windows: Git Bash when installed (same scripts as EC2).
 */
export async function runBash(
  script: string,
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  const bash = resolveBashBin();
  const canUseBash = !isWindows || (bash.includes(path.sep) && fs.existsSync(bash));
  if (canUseBash) {
    return runCommand(bash, ["-lc", script], {
      cwd: opts?.cwd,
      timeoutMs: opts?.timeoutMs ?? 15 * 60 * 1000,
      env: opts?.env,
    });
  }
  // Windows without Git Bash — PowerShell fallback (POSIX scripts may fail)
  return runCommand(resolvePowerShellBin(), ["-NoProfile", "-NonInteractive", "-Command", script], {
    cwd: opts?.cwd,
    timeoutMs: opts?.timeoutMs ?? 15 * 60 * 1000,
    env: opts?.env,
  });
}

/** Run a .sh file with argv (e.g. scripts/ec2-backup.sh predeploy). */
export async function runShellScript(
  scriptPath: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return runCommand(resolveBashBin(), [posixPath(scriptPath), ...args], {
    cwd: opts?.cwd,
    timeoutMs: opts?.timeoutMs ?? 25 * 60 * 1000,
    env: opts?.env,
  });
}

export function platformToolingSummary() {
  return {
    platform: process.platform,
    bash: resolveBashBin(),
    docker: resolveDockerBin(),
    tar: resolveTarBin(),
    curl: resolveCurlBin(),
    powershell: isWindows ? resolvePowerShellBin() : null,
  };
}
