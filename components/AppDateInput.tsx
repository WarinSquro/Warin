import { Calendar } from "lucide-react";
import { useAppDateFormat } from "../hooks/useAppDateFormat";

type AppDateInputProps = {
  value: string;
  onChange: (isoDate: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Extra classes for the native input shell (border/padding). */
  inputClassName?: string;
};

/**
 * Date field that stores ISO YYYY-MM-DD but displays Settings → Date Format.
 * Uses a native date picker (browser chrome) under a formatted text overlay.
 */
export function AppDateInput({
  value,
  onChange,
  min,
  max,
  disabled = false,
  id,
  className = "",
  inputClassName = "",
}: AppDateInputProps) {
  const { dateFormat, formatDate } = useAppDateFormat();
  const display = value ? formatDate(value) : "";

  return (
    <div className={`relative ${className}`}>
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 right-9 z-[1] flex items-center truncate px-2.5 text-[13px] ${
          disabled ? "text-muted" : display ? "text-foreground" : "text-muted-foreground"
        }`}
        aria-hidden
      >
        {display || dateFormat}
      </div>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-border bg-surface py-2 pl-2.5 pr-9 text-[13px] text-transparent outline-none [color-scheme:light] focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:text-transparent [&::-webkit-datetime-edit-fields-wrapper]:text-transparent ${
          disabled ? "" : "cursor-pointer"
        } ${inputClassName}`}
      />
      <Calendar className="pointer-events-none absolute right-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
