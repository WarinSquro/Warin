import type { ReactNode } from "react";

export function Tooltip({
  label,
  children,
  placement = "bottom",
}: {
  label: string;
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  const position =
    placement === "top"
      ? "bottom-full mb-1.5"
      : "top-full mt-1.5";

  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 ${position} -translate-x-1/2 whitespace-nowrap rounded-md bg-brand px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/tooltip:opacity-100`}
      >
        {label}
      </span>
    </span>
  );
}
