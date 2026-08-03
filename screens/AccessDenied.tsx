import { Link } from "react-router-dom";
import { ShieldX } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function AccessDenied() {
  const { signOut } = useAuth();

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center border-b border-border bg-surface px-5">
        <div className="text-[15px] font-semibold tracking-tight text-foreground">Access denied</div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
          <ShieldX className="h-7 w-7 text-danger" />
        </div>
        <div>
          <div className="text-[18px] font-semibold text-foreground">No pages assigned</div>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Your account has no page access yet. Contact your Super Admin to have permissions
            assigned.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md border border-border px-4 py-2 text-[13px] text-foreground hover:bg-surface-alt"
          >
            Sign out
          </button>
          <Link
            to="/account"
            className="rounded-md border border-border px-4 py-2 text-[13px] text-foreground hover:bg-surface-alt"
          >
            Account settings
          </Link>
          <Link
            to="/login"
            className="rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </>
  );
}
