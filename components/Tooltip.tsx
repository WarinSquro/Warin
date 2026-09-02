import type { ReactNode } from "react";

export function Tooltip({
  label,
  children,
  placement = "bottom",
  multiline = false,
}: {
  label: string;
  children: ReactNode;
  placement?: "top" | "bottom";
  multiline?: boolean;
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
        className={`pointer-events-none absolute z-50 ${position} rounded-md bg-brand px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/tooltip:opacity-100 ${
          multiline
            ? "right-0 w-max whitespace-pre text-right leading-snug"
            : "left-1/2 right-auto -translate-x-1/2 whitespace-nowrap"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
