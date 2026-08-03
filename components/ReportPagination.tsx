import { ChevronLeft, ChevronRight } from "lucide-react";

interface ReportPaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function ReportPagination({
  page,
  pageSize,
  totalRows,
  pageSizeOptions = [25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: ReportPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalRows);

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-soft bg-surface px-4 py-2.5">
      <div className="text-[12px] text-muted-foreground">
        Showing {start}–{end} of {totalRows}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-foreground">
          Rows
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] outline-none focus:border-primary"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center text-[12px] tabular-nums text-foreground">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
