import type { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-canvas-bg relative flex h-full w-full overflow-hidden">
      <img
        src="/wallpaper-auth.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-left opacity-70 select-none"
        draggable={false}
        aria-hidden
      />
      <div className="relative grid h-full w-full grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden lg:block" aria-hidden />
        <div className="relative flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="mt-8 flex w-full max-w-[400px] flex-col items-center sm:mt-12">
            <div className="w-full rounded-2xl border border-brand-border/15 bg-white/90 p-7 shadow-[0_8px_32px_rgba(21,47,57,0.10)] backdrop-blur-sm sm:p-8">
              {children}
            </div>
            <div className="mt-8 flex w-full flex-col items-center text-center">
              <img src="/Warin-logo.png" alt="Warin" className="h-9 w-auto max-w-[200px] object-contain" />
              <div className="mt-4 text-[13px] font-medium leading-snug text-brand">
                Backup &amp; Deployment Operations
              </div>
              <div className="mt-1.5 text-[12px] font-medium leading-snug tracking-wide text-brand-muted">
                Standalone ops console — independent of WARIN application database
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
