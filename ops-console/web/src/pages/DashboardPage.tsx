import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Download, RefreshCw, LogOut, ShieldAlert, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useBusy } from "../lib/busy";
import { api, formatBytes, formatWhen } from "../lib/api";
import { useConfirm } from "../components/ConfirmDialog";
import { useCredentialPrompt } from "../components/CredentialDialog";

type Tab =
  | "overview"
  | "backups"
  | "predeploy"
  | "docker"
  | "commands"
  | "deploy"
  | "checklist"
  | "history"
  | "retention"
  | "audit";

export function DashboardPage() {
  const { userId, loading, logout } = useAuth();
  const { busy, withBusy } = useBusy();
  const { confirm, dialog } = useConfirm();
  const { promptCredentials, dialog: credDialog } = useCredentialPrompt();
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<any>(null);
  const [backups, setBackups] = useState<any>(null);
  const [commands, setCommands] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [retention, setRetention] = useState<any>(null);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cmdOut, setCmdOut] = useState<string>("");
  const [activeBackup, setActiveBackup] = useState<"database" | "application" | "docker" | null>(null);
  const [deployOpts, setDeployOpts] = useState({
    pull: true,
    rebuildApi: true,
    rebuildSpa: true,
    runMigrate: false,
    targetRef: "main",
  });

  const refreshAll = useCallback(async () => {
    setErr(null);
    const [st, bk, cmd, cl, au, ret, dep] = await Promise.all([
      api("/status"),
      api("/backups"),
      api<{ commands: any[] }>("/commands"),
      api<{ items: any[] }>("/checklist"),
      api<{ audit: any[] }>("/audit"),
      api("/retention"),
      api<{ deployments: any[] }>("/deployments"),
    ]);
    setStatus(st);
    setBackups(bk);
    setCommands(cmd.commands);
    setChecklist(cl.items);
    setAudit(au.audit);
    setRetention(ret);
    setDeployments(dep.deployments);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void withBusy(async () => {
      try {
        await refreshAll();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }, [userId, refreshAll, withBusy]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setMsg(null);
    setErr(null);
    try {
      await withBusy(async () => {
        await fn();
        await refreshAll();
      });
      setMsg(`${label} completed`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const runBackup = async (kind: "database" | "application" | "docker", label: string, path: string) => {
    setActiveBackup(kind);
    try {
      await run(label, () => api(path, { method: "POST", json: {} }));
    } finally {
      setActiveBackup(null);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of commands) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    return [...m.entries()];
  }, [commands]);

  if (loading) return <div className="grid h-full place-items-center text-muted">Loading…</div>;
  if (!userId) return <Navigate to="/login" replace />;

  const summary = backups?.summary;
  const latestDatabaseDump = backups?.filesystem?.[0];

  const downloadLatestDatabaseDump = () => {
    setErr(null);
    setMsg("Latest database dump download started");
    const link = document.createElement("a");
    link.href = "/api/ops/backups/database/latest/download";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {dialog}
      {credDialog}
      <header className="flex items-center justify-between border-b border-border bg-brand px-4 py-3 text-brand-fg">
        <div className="flex items-center gap-3">
          <img src="/Warin-logo.png" alt="" className="h-7 brightness-0 invert" />
          <div>
            <div className="text-[14px] font-semibold text-white">Backup &amp; Deployment Management</div>
            <div className="flex items-center gap-2 text-[11px] text-brand-muted">
              <ShieldAlert size={12} />
              <span className="font-semibold tracking-wide text-amber-200">
                {status?.environment || "PRODUCTION"}
              </span>
              <span>· signed in as {userId}</span>
              <span>· storage isolated from WARIN DB</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost !border-brand-border !bg-brand-active !text-white"
            disabled={busy}
            onClick={() => void withBusy(() => refreshAll())}
          >
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={14} /> Refresh
            </span>
          </button>
          <button
            type="button"
            className="btn btn-ghost !border-brand-border !bg-transparent !text-white"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void (async () => {
                const ok = await confirm({
                  title: "End this session?",
                  message: "Are you sure you want to sign out of Backup & Deployment Management?",
                  confirmLabel: "Sign out",
                });
                if (!ok) return;
                await withBusy(() => logout());
              })();
            }}
          >
            <span className="inline-flex items-center gap-1">
              <LogOut size={14} /> Sign out
            </span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface p-2 text-[12px]">
          {(
            [
              ["overview", "Overview"],
              ["backups", "Backup Management"],
              ["predeploy", "Backup Before Deployment"],
              ["docker", "Docker Container Status"],
              ["commands", "Manual Commands"],
              ["deploy", "Production Deployment"],
              ["checklist", "Go-Live Checklist"],
              ["history", "Backup History"],
              ["retention", "Backup Retention"],
              ["audit", "Audit Log"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`mb-0.5 w-full cursor-pointer rounded-md px-3 py-2 text-left font-medium ${
                tab === id ? "bg-brand text-white" : "text-foreground hover:bg-background"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          {(msg || err) && (
            <div
              className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] ${
                err ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-emerald-50 text-success"
              }`}
            >
              <div className="min-w-0 flex-1 break-words">{err || msg}</div>
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded p-0.5 opacity-70 hover:opacity-100"
                aria-label="Close message"
                onClick={() => {
                  setMsg(null);
                  setErr(null);
                }}
              >
                <X size={16} strokeWidth={2.25} />
              </button>
            </div>
          )}

          {tab === "overview" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Production overview</h1>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Git" value={status?.git?.shortSha || "—"} sub={status?.git?.branch} />
                <Stat label="Containers" value={String(status?.containers?.length ?? "—")} />
                <Stat label="DB backups" value={String(summary?.databaseBackups ?? "—")} />
                <Stat label="Backup storage" value={formatBytes(summary?.totalStorageBytes)} />
              </div>
              <pre className="overflow-auto rounded-lg border border-border bg-white p-3 text-[11px] text-muted">
                {status?.appHealthRaw || "Health unavailable"}
              </pre>
              <p className="text-[12px] text-muted">
                App dir: <code>{status?.warinAppDir}</code> · Backups: <code>{status?.backupRoot}</code>
              </p>
            </section>
          )}

          {tab === "backups" && (
            <section className="space-y-6">
              <h1 className="text-[18px] font-semibold text-brand">Backup Management</h1>
              <div className="grid gap-4 lg:grid-cols-3">
                <BackupCard
                  title="Database Backup"
                  hint="pg_dump custom format via Docker"
                  latest={backups?.records?.find((b: any) => b.type === "database")}
                  count={backups?.records?.filter((b: any) => b.type === "database").length}
                  busy={busy}
                  progressing={activeBackup === "database"}
                  onBackup={() => void runBackup("database", "Database backup", "/backups/database")}
                  download={{
                    available: Boolean(latestDatabaseDump),
                    label: "Download latest dump",
                    detail: latestDatabaseDump
                      ? `${formatWhen(latestDatabaseDump.createdAt)} · ${formatBytes(latestDatabaseDump.sizeBytes)}`
                      : "Create a database backup first",
                    onDownload: downloadLatestDatabaseDump,
                  }}
                />
                <BackupCard
                  title="Application Backup"
                  hint="Uploaded files volume (/data/files)"
                  latest={backups?.records?.find((b: any) => b.type === "application")}
                  count={backups?.records?.filter((b: any) => b.type === "application").length}
                  busy={busy}
                  progressing={activeBackup === "application"}
                  onBackup={() => void runBackup("application", "Application backup", "/backups/application")}
                />
                <BackupCard
                  title="Docker / Deployment Backup"
                  hint="Compose, scripts, infra — secrets copied but never shown"
                  latest={backups?.records?.find((b: any) => b.type === "docker")}
                  count={backups?.records?.filter((b: any) => b.type === "docker").length}
                  busy={busy}
                  progressing={activeBackup === "docker"}
                  onBackup={() => void runBackup("docker", "Docker backup", "/backups/docker")}
                />
              </div>
              <RestorePanel
                dumps={(backups?.filesystem || []).filter((f: any) => f.restoreAvailable)}
                busy={busy}
                onRestore={async (dumpPath: string) => {
                  const dumpName = dumpPath.split(/[/\\]/).pop() || dumpPath;
                  const creds = await promptCredentials({
                    title: "Verify credentials to restore",
                    message:
                      "Database restore is destructive. Enter your Backup & Deployment User Id and password to continue.",
                    submitLabel: "Verify",
                    verify: async (userId, password) => {
                      await api("/auth/verify", { method: "POST", json: { userId, password } });
                    },
                  });
                  if (!creds) return;
                  const ok = await confirm({
                    title: "Restore selected dump?",
                    danger: true,
                    confirmLabel: "Restore dump",
                    message: (
                      <>
                        Credentials verified. Restore dump{" "}
                        <strong className="break-all text-foreground">{dumpName}</strong>
                        {" "}into production Postgres?
                        <div className="mt-2 break-all text-[11px] text-muted">{dumpPath}</div>
                        <div className="mt-2">Existing data may be overwritten. This cannot be undone from this dialog.</div>
                      </>
                    ),
                  });
                  if (!ok) return;
                  await run("Database restore", () =>
                    api("/backups/restore", {
                      method: "POST",
                      json: {
                        path: dumpPath,
                        confirm: true,
                        userId: creds.userId,
                        password: creds.password,
                      },
                    }),
                  );
                }}
              />
            </section>
          )}

          {tab === "predeploy" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Backup Before Deployment</h1>
              <p className="text-[13px] text-muted">
                Records current Git SHA, runs <code>ec2-backup.sh predeploy</code> (DB + files + meta), verifies completion,
                and stores metadata in this console&apos;s own storage. Deployment is blocked if this fails.
              </p>
              <div className="rounded-lg border border-border bg-white p-4 text-[13px]">
                <div>Current SHA: <strong>{status?.git?.sha || "—"}</strong></div>
                <div className="mt-1">Branch: {status?.git?.branch}</div>
                <div className="mt-1 text-muted">{status?.git?.status}</div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void run("Pre-deployment backup", () => api("/backups/predeploy", { method: "POST", json: {} }))
                }
              >
                {busy ? "Running…" : "Create pre-deployment backup"}
              </button>
              {backups?.records?.filter((b: any) => b.type === "predeploy").slice(0, 5).map((b: any) => (
                <div key={b.id} className="rounded border border-border bg-white p-3 text-[12px]">
                  <div className="font-semibold">{b.status} · {formatWhen(b.createdAt)}</div>
                  <div className="text-muted">{b.location}</div>
                  <div>{formatBytes(b.sizeBytes)} · git {b.gitSha}</div>
                </div>
              ))}
            </section>
          )}

          {tab === "docker" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-[18px] font-semibold text-brand">Docker Container Status</h1>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void withBusy(() => refreshAll())}
                >
                  Refresh
                </button>
              </div>
              {status?.dockerError && <div className="text-[13px] text-danger">{status.dockerError}</div>}
              <div className="overflow-x-auto rounded-lg border border-border bg-white">
                <table className="w-full text-left text-[12px]">
                  <thead className="border-b border-border bg-background text-muted">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Image</th>
                      <th className="px-3 py-2">Tag</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Health</th>
                      <th className="px-3 py-2">Ports</th>
                      <th className="px-3 py-2">Uptime</th>
                      <th className="px-3 py-2">Restarts</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(status?.containers || []).map((c: any) => (
                      <tr key={c.name} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate" title={c.image}>{c.image}</td>
                        <td className="px-3 py-2">{c.imageTag}</td>
                        <td className="px-3 py-2">
                          <span className={`badge badge-${String(c.statusLabel).toLowerCase()}`}>{c.statusLabel}</span>
                        </td>
                        <td className="px-3 py-2">{c.health}</td>
                        <td className="px-3 py-2 max-w-[160px] truncate" title={c.ports}>{c.ports || "—"}</td>
                        <td className="px-3 py-2">{c.uptime || "—"}</td>
                        <td className="px-3 py-2">{c.restartCount ?? "—"}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="btn btn-ghost !py-1 !text-[11px]"
                            disabled={busy}
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Restart ${c.name}?`,
                                danger: true,
                                message: "This restarts a production container.",
                              });
                              if (!ok) return;
                              await run(`Restart ${c.name}`, () =>
                                api("/docker/restart", { method: "POST", json: { name: c.name, confirm: true } }),
                              );
                            }}
                          >
                            Restart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "commands" && (
            <section className="space-y-6">
              <h1 className="text-[18px] font-semibold text-brand">Manual Commands</h1>
              <p className="text-[13px] text-muted">
                Allowlisted read-only commands can run from the UI. Destructive operations are shown for copy/paste only
                (no arbitrary shell).
              </p>
              {groups.map(([cat, items]) => (
                <div key={cat}>
                  <h2 className="mb-2 text-[14px] font-semibold text-brand">{cat}</h2>
                  <div className="space-y-2">
                    {items.map((c: any) => (
                      <div key={c.id} className="rounded-lg border border-border bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[13px] font-semibold">{c.title}</div>
                            <div className="text-[11px] text-muted">{c.description}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => void navigator.clipboard.writeText(c.command)}
                            >
                              Copy
                            </button>
                            {c.runnable && !c.destructive && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={busy}
                                onClick={() =>
                                  void run(c.title, async () => {
                                    const r = await api<{ result: { stdout: string; stderr: string; ok: boolean } }>(
                                      "/commands/run",
                                      { method: "POST", json: { id: c.id } },
                                    );
                                    setCmdOut(
                                      `$ ${c.command}\n\n${r.result.stdout || ""}${r.result.stderr ? "\n" + r.result.stderr : ""}`,
                                    );
                                  })
                                }
                              >
                                Run
                              </button>
                            )}
                          </div>
                        </div>
                        <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[11px] text-foreground whitespace-pre-wrap">
                          {c.command}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {cmdOut && (
                <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-brand p-3 text-[11px] text-brand-fg whitespace-pre-wrap">
                  {cmdOut}
                </pre>
              )}
            </section>
          )}

          {tab === "deploy" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Production Deployment — AWS EC2</h1>
              <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
                <li>Check current production status</li>
                <li>Verify target Git branch/tag/commit</li>
                <li>Create pre-deployment backup</li>
                <li>Verify backup</li>
                <li>Pull latest approved code</li>
                <li>Build if required</li>
                <li>Run database migration if required</li>
                <li>Deploy containers</li>
                <li>Verify container health</li>
                <li>Verify application health</li>
                <li>Check production logs</li>
                <li>Complete deployment</li>
              </ol>
              <div className="grid gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-2 text-[13px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={deployOpts.pull} onChange={(e) => setDeployOpts({ ...deployOpts, pull: e.target.checked })} />
                  Pull latest code
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={deployOpts.rebuildApi} onChange={(e) => setDeployOpts({ ...deployOpts, rebuildApi: e.target.checked })} />
                  Rebuild API / worker
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={deployOpts.rebuildSpa} onChange={(e) => setDeployOpts({ ...deployOpts, rebuildSpa: e.target.checked })} />
                  Rebuild SPA
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={deployOpts.runMigrate} onChange={(e) => setDeployOpts({ ...deployOpts, runMigrate: e.target.checked })} />
                  Run database migrations
                </label>
                <label className="col-span-full text-[12px]">
                  Target ref
                  <input
                    className="mt-1 h-9 w-full rounded border border-border px-2"
                    value={deployOpts.targetRef}
                    onChange={(e) => setDeployOpts({ ...deployOpts, targetRef: e.target.value })}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Deploy to PRODUCTION?",
                    danger: true,
                    message: (
                      <>
                        This will run pre-deploy backup, then optional pull/build/migrate against{" "}
                        <strong>{status?.warinAppDir}</strong>. Migrations and container rebuilds can affect live users.
                      </>
                    ),
                  });
                  if (!ok) return;
                  await run("Production deployment", () =>
                    api("/deploy", { method: "POST", json: { ...deployOpts, confirm: true } }),
                  );
                }}
              >
                {busy ? "Deploying…" : "Run deployment sequence"}
              </button>
              {deployments.slice(0, 3).map((d: any) => (
                <div key={d.id} className="rounded border border-border bg-white p-3 text-[12px]">
                  <div className="font-semibold">
                    {d.status} · {formatWhen(d.at)} · {d.fromSha?.slice(0, 7)} → {d.toSha?.slice(0, 7) || "…"}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {d.steps?.map((s: any, i: number) => (
                      <li key={i}>
                        <span className={s.status === "failed" ? "text-danger" : "text-success"}>{s.status}</span> — {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {tab === "checklist" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Production Go-Live Checklist</h1>
              <div className="space-y-2 rounded-lg border border-border bg-white p-4">
                {checklist.map((item: any) => (
                  <label key={item.key} className="flex cursor-pointer items-start gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={item.checked}
                      onChange={(e) =>
                        void run("Checklist", () =>
                          api("/checklist", { method: "PUT", json: { key: item.key, checked: e.target.checked } }),
                        )
                      }
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Backup History</h1>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Total" value={String(summary?.totalBackups ?? 0)} />
                <Stat label="Database" value={String(summary?.databaseBackups ?? 0)} />
                <Stat label="Application" value={String(summary?.applicationBackups ?? 0)} />
                <Stat label="Storage used" value={formatBytes(summary?.totalStorageBytes)} />
              </div>
              <div className="text-[12px] text-muted">
                Latest successful: {formatWhen(summary?.latestSuccessfulBackup?.createdAt)} · Oldest retained:{" "}
                {formatWhen(summary?.oldestRetainedBackup?.createdAt)}
              </div>
              <HistoryTable records={backups?.records || []} />
            </section>
          )}

          {tab === "retention" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Backup Retention</h1>
              <pre className="rounded-lg border border-border bg-white p-3 text-[12px]">
                {JSON.stringify(retention?.policy, null, 2)}
              </pre>
              <div className="grid gap-3 sm:grid-cols-3 text-[13px]">
                <Stat label="Retained" value={String(retention?.retainedCount ?? 0)} />
                <Stat label="Eligible cleanup" value={String(retention?.eligibleCleanupCount ?? 0)} />
                <Stat label="Expired" value={String(retention?.expiredCount ?? 0)} />
              </div>
              <p className="text-[12px] text-muted">{retention?.note}</p>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete expired backups?",
                    danger: true,
                    message: "Only backups past the retention window will be removed. In-retention backups are never deleted.",
                  });
                  if (!ok) return;
                  await run("Retention cleanup", () =>
                    api("/retention/cleanup", { method: "POST", json: { confirm: true } }),
                  );
                }}
              >
                Cleanup expired (confirm)
              </button>
            </section>
          )}

          {tab === "audit" && (
            <section className="space-y-4">
              <h1 className="text-[18px] font-semibold text-brand">Audit Log</h1>
              <p className="text-[12px] text-muted">Secrets are never stored in audit entries.</p>
              <div className="overflow-x-auto rounded-lg border border-border bg-white">
                <table className="w-full text-left text-[12px]">
                  <thead className="border-b bg-background text-muted">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Git</th>
                      <th className="px-3 py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a: any) => (
                      <tr key={a.id} className="border-b border-border/50">
                        <td className="px-3 py-2 whitespace-nowrap">{formatWhen(a.at)}</td>
                        <td className="px-3 py-2">{a.user}</td>
                        <td className="px-3 py-2">{a.action}</td>
                        <td className="px-3 py-2">{a.result}</td>
                        <td className="px-3 py-2">{a.gitSha || "—"}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={a.detail || a.error}>
                          {a.error || a.detail || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-[18px] font-semibold text-brand">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function BackupCard({
  title,
  hint,
  latest,
  count,
  busy,
  progressing,
  onBackup,
  download,
}: {
  title: string;
  hint: string;
  latest: any;
  count: number;
  busy: boolean;
  progressing: boolean;
  onBackup: () => void;
  download?: {
    available: boolean;
    label: string;
    detail: string;
    onDownload: () => void;
  };
}) {
  return (
    <div className={`rounded-lg border bg-white p-4 ${progressing ? "border-primary/40" : "border-border"}`}>
      <div className="text-[14px] font-semibold text-brand">{title}</div>
      <div className="mt-1 text-[11px] text-muted">{hint}</div>
      <div className="mt-3 space-y-1 text-[12px]">
        <div>
          Status: <strong>{progressing ? "running" : latest?.status || "—"}</strong>
        </div>
        <div>Date/time: {formatWhen(latest?.createdAt)}</div>
        <div>Size: {formatBytes(latest?.sizeBytes)}</div>
        <div className="truncate" title={latest?.location}>
          Location: {latest?.location || "—"}
        </div>
        <div>Total available: {count ?? 0}</div>
        <div>
          Latest successful:{" "}
          {latest && (latest.status === "success" || latest.status === "verified")
            ? formatWhen(latest.completedAt || latest.createdAt)
            : "—"}
        </div>
      </div>
      {progressing && (
        <div className="mt-3" role="progressbar" aria-busy="true" aria-label={`${title} in progress`}>
          <div className="mb-1 text-[11px] font-medium text-primary">Creating backup…</div>
          <div className="ops-progress-track h-2 overflow-hidden rounded-full bg-brand/10">
            <div className="ops-progress-indeterminate h-full rounded-full bg-primary" />
          </div>
        </div>
      )}
      <div className="mt-4 space-y-2">
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={onBackup}>
          {progressing ? "Creating backup…" : "Create backup"}
        </button>
        {download && (
          <>
            <button
              type="button"
              className="btn btn-ghost w-full cursor-pointer"
              disabled={busy || !download.available}
              onClick={download.onDownload}
            >
              <span className="inline-flex items-center gap-1">
                <Download size={14} /> {download.label}
              </span>
            </button>
            <div className="text-center text-[11px] text-muted">{download.detail}</div>
          </>
        )}
      </div>
    </div>
  );
}

function RestorePanel({
  dumps,
  busy,
  onRestore,
}: {
  dumps: any[];
  busy: boolean;
  onRestore: (path: string) => Promise<void>;
}) {
  const [path, setPath] = useState("");
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="text-[14px] font-semibold text-brand">Database restore</div>
      <p className="mt-1 text-[12px] text-muted">
        Requires credential verification and explicit confirmation. Never overwrites an existing backup file.
      </p>
      <select
        className="mt-3 h-9 w-full rounded border border-border bg-white px-2 text-[12px]"
        value={path}
        onChange={(e) => setPath(e.target.value)}
      >
        <option value="">Select dump…</option>
        {dumps.map((d) => (
          <option key={d.location} value={d.location}>
            {d.location} ({formatBytes(d.sizeBytes)})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-danger mt-3"
        disabled={busy || !path}
        onClick={() => void onRestore(path)}
      >
        Restore selected dump…
      </button>
    </div>
  );
}

function HistoryTable({ records }: { records: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full text-left text-[12px]">
        <thead className="border-b bg-background text-muted">
          <tr>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Date/time</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Git</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Retention</th>
            <th className="px-3 py-2">Restore</th>
          </tr>
        </thead>
        <tbody>
          {records.map((b) => {
            const expired = b.expiresAt && new Date(b.expiresAt).getTime() < Date.now();
            return (
              <tr key={b.id} className="border-b border-border/50">
                <td className="px-3 py-2">{b.type}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatWhen(b.createdAt)}</td>
                <td className="px-3 py-2">{formatBytes(b.sizeBytes)}</td>
                <td className="px-3 py-2">{b.status}</td>
                <td className="px-3 py-2">{b.gitSha || "—"}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={b.location}>{b.location}</td>
                <td className="px-3 py-2">{expired ? "Expired" : b.retentionClass || "Retained"}</td>
                <td className="px-3 py-2">{b.restoreAvailable ? "Yes" : "No"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
