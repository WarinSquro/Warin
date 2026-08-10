import type { ReactNode } from "react";
import { ProductLogo } from "./ProductLogo";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-canvas-bg relative flex h-full w-full overflow-hidden">
      {/*
        Fill viewport without stretching: object-cover keeps aspect ratio (may crop edges).
        object-left keeps the block art on the left; form sits over the open beige area.
      */}
      <img
        src="/wallpaper-auth.png?v=2"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-left opacity-70 select-none"
        draggable={false}
        aria-hidden
      />

      <div className="relative grid h-full w-full grid-cols-1 lg:grid-cols-2">
        {/* Left half — wallpaper shows through */}
        <div className="relative hidden lg:block" aria-hidden />

        {/* Right half — sign-in stack centered */}
        <div className="relative flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="mt-8 flex w-full max-w-[400px] flex-col items-center sm:mt-12">
            <div className="w-full rounded-2xl border border-brand-border/15 bg-white/90 p-7 shadow-[0_8px_32px_rgba(21,47,57,0.10)] backdrop-blur-sm sm:p-8">
              {children}
            </div>

            <div className="mt-8 flex w-full flex-col items-center text-center">
              <ProductLogo height={36} align="center" className="max-w-[200px]" />
              <div className="mt-4 text-[13px] font-medium leading-snug text-brand">
                The Operating System for the Organization
              </div>
              <div className="mt-1.5 text-[12px] font-medium leading-snug tracking-wide text-brand-muted">
                Connecting People, Projects and Performance
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
