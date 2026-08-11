import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, LogOut, Shield } from "lucide-react";
import { changePinApi, verifyPinApi } from "../api/client";
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
    if (page.accessRightsVisible === false) continue;
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

type PinFieldKey = "current" | "new" | "confirm";

export function AccountSettings() {
  const navigate = useNavigate();
  const { currentEmployee, isSuperAdmin, allowedKeys, signOut, sessionEmail } = useAuth();
  const toast = useToast();
  const pinFormRef = useFocusFirstField<HTMLDivElement>();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinErrorFields, setPinErrorFields] = useState<Set<PinFieldKey>>(new Set());
  const [pinSaving, setPinSaving] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const accessLabels = useMemo(
    () => assignedPageLabels(allowedKeys, isSuperAdmin),
    [allowedKeys, isSuperAdmin]
  );

  const pinReady =
    /^\d{5}$/.test(currentPin) && /^\d{5}$/.test(newPin) && /^\d{5}$/.test(confirmPin) && !pinSaving;

  const clearPinErrors = () => {
    setPinErrorFields(new Set());
  };

  const setFieldError = (message: string, fields: PinFieldKey[]) => {
    setPinErrorFields(new Set(fields));
    toast.error(message);
  };

  const submitPin = async () => {
    if (!pinReady) return;
    setPinSaving(true);
    clearPinErrors();
    try {
      // 1) Current PIN must be validated first
      try {
        await verifyPinApi(currentPin);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Current PIN do not match.";
        setFieldError(
          /current pin do not match|invalid current pin|current pin is incorrect/i.test(message)
            ? "Current PIN do not match."
            : message,
          ["current"]
        );
        return;
      }

      // 2) Then New PIN vs Confirm New PIN
      if (newPin !== confirmPin) {
        setFieldError("New PIN and Confirm New PIN do not match.", ["new", "confirm"]);
        return;
      }

      await changePinApi(currentPin, newPin);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      toast.updated();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update PIN.";
      if (/current pin do not match|invalid current pin|current pin is incorrect/i.test(message)) {
        setFieldError("Current PIN do not match.", ["current"]);
      } else if (/different from the current pin/i.test(message)) {
        setFieldError("New PIN must be different from the current PIN.", ["new"]);
      } else {
        setFieldError(message, ["current", "new", "confirm"]);
      }
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
                required
                value={currentPin}
                invalid={pinErrorFields.has("current")}
                onChange={(v) => {
                  setCurrentPin(v);
                  clearPinErrors();
                }}
                autoComplete="current-password"
              />
              <PinField
                label="New PIN"
                required
                value={newPin}
                invalid={pinErrorFields.has("new")}
                onChange={(v) => {
                  setNewPin(v);
                  clearPinErrors();
                }}
                autoComplete="new-password"
              />
              <PinField
                label="Confirm new PIN"
                required
                value={confirmPin}
                invalid={pinErrorFields.has("confirm")}
                onChange={(v) => {
                  setConfirmPin(v);
                  clearPinErrors();
                }}
                autoComplete="new-password"
              />
            </div>
            <div className="mt-4">
              <button
                type="button"
                disabled={!pinReady}
                onClick={() => void submitPin()}
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium ${
                  pinReady
                    ? "cursor-pointer bg-primary text-primary-foreground hover:opacity-90"
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
              className="mt-4 cursor-pointer rounded-md border border-danger-border bg-danger-soft px-3.5 py-1.5 text-[12px] font-medium text-danger hover:opacity-90"
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
                className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt"
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
                className="flex-1 cursor-pointer rounded-md bg-danger py-2 text-[13px] font-medium text-white"
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
  required,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const [showPin, setShowPin] = useState(false);

  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <div className="relative">
        <input
          type={showPin ? "text" : "password"}
          inputMode="numeric"
          autoComplete={autoComplete}
          maxLength={5}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
          aria-invalid={invalid || undefined}
          className={`w-full rounded-md border bg-surface py-2 pl-3 pr-10 text-[13px] tabular-nums tracking-widest text-foreground outline-none focus:border-primary ${
            invalid ? "border-danger bg-danger-soft/30" : "border-border"
          }`}
        />
        <button
          type="button"
          onClick={() => setShowPin((v) => !v)}
          aria-label={showPin ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
