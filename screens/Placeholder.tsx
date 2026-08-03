import { Hammer } from "lucide-react";

export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center border-b border-border bg-surface px-5">
        <div className="text-[15px] font-semibold tracking-tight text-foreground">{title}</div>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface">
            <Hammer className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div className="text-[15px] font-semibold text-foreground">{title}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {note ?? "This screen is part of phase 1 and will be built next."}
          </p>
        </div>
      </div>
    </>
  );
}
