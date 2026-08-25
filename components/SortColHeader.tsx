import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

export function useColumnSort<K extends string>(defaultKey: K, defaultDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const handleSort = (col: K) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  return { sortKey, sortDir, handleSort, setSortKey, setSortDir };
}

export function SortColHeader<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className = "",
  fillCell = false,
}: {
  label: ReactNode;
  col: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (col: K) => void;
  className?: string;
  /** When true, label + icon stay inside a fixed table column (truncate label). */
  fillCell?: boolean;
}) {
  const active = sortKey === col;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`group items-center gap-1 text-left transition-colors hover:text-foreground ${
        fillCell ? "flex w-full min-w-0" : "inline-flex w-fit max-w-full"
      } ${active ? "text-foreground" : ""} ${className}`}
    >
      <span className={`min-w-0 leading-tight ${fillCell ? "truncate" : ""}`}>{label}</span>
      <Icon
        className={`h-3 w-3 shrink-0 ${
          active ? "text-foreground" : "text-muted-foreground/50 group-hover:text-muted-foreground"
        }`}
      />
    </button>
  );
}
