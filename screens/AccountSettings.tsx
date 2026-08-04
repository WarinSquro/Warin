import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Shield } from "lucide-react";
import { changePinApi } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PERMISSION_PAGES, type PermissionPage } from "../data/navConfig";
import { useFocusFirstField } from "../hooks/useFocusFirstField";

function pageLabel(page: PermissionPage): string {
  return page.label;
}

function assignedPageLabels(allowedKeys: Set<string>, isSuperAdmin: boolean): string[] {
  if (isSuperAdmin || allowedKeys.has("*")) {
    return ["Full access (Super Admin)"];
  }
  const labels: string[] = [];
  for (const page of PERMISSION_PAGES) {
    if (page.superAdminOnly) continue;
    if (page.children?.length) {
      const childLabels = page.children
        .filter((c) => allowedKeys.has(c.key))
        .map((c) => `${page.label} · ${c.label}`);
      labels.push(...childLabels);
    } else if (allowedKeys.has(page.key)) {
      labels.push(pageLabel(page));
    }
  }
  return labels.sort((a, b) => a.localeCompare(b));
}

export function AccountSettings() {
  const navigate = useNavigate();
  const { currentEmployee, isSuperAdmin, allowedKeys, signOut, sessionEmail } = useAuth();
  const toast = useToast();
  const pinFormRef = useFocusFirstField<HTMLDivElement>();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const accessLabels = useMemo(
    () => assignedPageLabels(allowedKeys, isSuperAdmin),
    [allowedKeys, isSuperAdmin]
  );

  const pinReady =
    /^\d{5}$/.test(currentPin) && /^\d{5}$/.test(newPin) && /^\d{5}$/.test(confirmPin) && !pinSaving;

  const submitPin = async () => {
    if (!pinReady) return;
    if (newPin !== confirmPin) {
      setPinError("New PIN and confirmation do not match.");
      return;
    }
    if (newPin === currentPin) {
      setPinError("New PIN must be different from the current PIN.");
      return;
    }
    setPinSaving(true);
    setPinError("");
    try {
      await changePinApi(currentPin, newPin);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      toast.updated();
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Could not update PIN.");
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Profile</div>
          <div className="text-[12px] text-muted-foreground">
            Your details, PIN, and access · not org System Parameters
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-background p-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="text-[13px] font-semibold text-foreground">Profile</div>
            <div className="mt-1 text-[12px] text-muted-foreground">Read-only · contact an admin to update master data</div>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name" value={currentEmployee?.name ?? "—"} />
              <Field label="Email" value={currentEmployee?.email ?? sessionEmail ?? "—"} />
              <Field label="HRMS ID" value={currentEmployee?.id ?? "—"} />
              <Field label="Department" value={currentEmployee?.department ?? "—"} />
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold text-foreground">Security · Change PIN</div>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">5-digit numeric PIN used to sign in</div>
            <div ref={pinFormRef} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PinField
                label="Current PIN"
                value={currentPin}
                onChange={setCurrentPin}
                autoComplete="current-password"
              />
              <PinField
                label="New PIN"
                value={newPin}
                onChange={setNewPin}
                autoComplete="new-password"
              />
              <PinField
                label="Confirm new PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                autoComplete="new-password"
              />
            </div>
            {(pinError) && (
              <div className={`mt-3 text-[12px] text-danger`}>
                {pinError}
              </div>
            )}
            <div className="mt-4">
              <button
                type="button"
                disabled={!pinReady}
                onClick={() => void submitPin()}
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium ${
                  pinReady
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "cursor-not-allowed bg-surface-alt text-muted-foreground"
                }`}
              >
                {pinSaving ? "Updating…" : "Update PIN"}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold text-foreground">Access</div>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              Pages you can open · assigned by Super Admin via Access Rights
            </div>
            {accessLabels.length === 0 ? (
              <div className="mt-3 text-[12px] text-muted-foreground">No pages assigned yet.</div>
            ) : (
              <ul className="mt-3 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-[12px] text-foreground">
                {accessLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-danger" />
              <div className="text-[13px] font-semibold text-foreground">Session</div>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              Signed in as {currentEmployee?.email ?? sessionEmail ?? "—"}
            </div>
            <button
              type="button"
              onClick={() => setLogoutConfirm(true)}
              className="mt-4 rounded-md border border-danger-border bg-danger-soft px-3.5 py-1.5 text-[12px] font-medium text-danger hover:opacity-90"
            >
              Log out
            </button>
          </section>
        </div>
      </div>

      {logoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-brand/50" onClick={() => setLogoutConfirm(false)} />
          <div className="relative z-10 w-full max-w-[360px] rounded-xl bg-surface p-5 text-center shadow-2xl">
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft">
                <LogOut className="h-5 w-5 text-danger" />
              </div>
            </div>
            <div className="mt-3 text-[15px] font-semibold text-foreground">
              Are you sure you want to Log out ?
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setLogoutConfirm(false)}
                className="flex-1 rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setLogoutConfirm(false);
                  signOut();
                  navigate("/login", { replace: true });
                }}
                className="flex-1 rounded-md bg-danger py-2 text-[13px] font-medium text-white"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-foreground">{value}</dd>
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-foreground">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={5}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] tabular-nums tracking-widest text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
