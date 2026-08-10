import { spawn } from "node:child_process";
import { redactSecrets } from "../store.js";

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string;
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
      env: { ...process.env, ...opts?.env },
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

/** Prefer bash on Linux/EC2; on Windows try bash (Git) then fail clearly for docker-centric ops. */
export async function runBash(
  script: string,
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  const bash = process.platform === "win32" ? "bash" : "bash";
  return runCommand(bash, ["-lc", script], {
    cwd: opts?.cwd,
    timeoutMs: opts?.timeoutMs ?? 15 * 60 * 1000,
    env: opts?.env,
  });
}
