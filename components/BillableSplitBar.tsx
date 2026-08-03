interface BillableSplitBarProps {
  billablePct: number;
  nonBillablePct: number;
  leaveException?: boolean;
}

export function BillableSplitBar({ billablePct, nonBillablePct, leaveException }: BillableSplitBarProps) {
  if (leaveException) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-2 min-w-[72px] flex-1 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full w-full bg-muted-foreground/30" />
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">N/A</span>
      </div>
    );
  }

  const bill = Math.max(0, Math.min(100, billablePct));
  const nonBill = Math.max(0, Math.min(100, nonBillablePct));

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex h-2 min-w-[72px] flex-1 overflow-hidden rounded-full bg-surface-alt">
        {bill > 0 && (
          <div className="h-full bg-success transition-all" style={{ width: `${bill}%` }} />
        )}
        {nonBill > 0 && (
          <div className="h-full bg-muted-foreground/35 transition-all" style={{ width: `${nonBill}%` }} />
        )}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {bill}% / {nonBill}%
      </span>
    </div>
  );
}
