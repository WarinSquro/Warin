import type { WeeklyConfidence, WeeklyStatus } from "../data/weeklyCheckIn";

const STATUS_STYLES: Record<WeeklyStatus, string> = {
  "On Track": "border-success-border bg-success-soft text-success-fg",
  Watch: "border-warning-border bg-warning-soft text-warning",
  "Intervention Required": "border-danger-border bg-danger-soft text-danger",
};

interface WeeklyCheckInStatusPickerProps {
  value: WeeklyStatus;
  onChange: (v: WeeklyStatus) => void;
  disabled?: boolean;
}

export function WeeklyCheckInStatusPicker({
  value,
  onChange,
  disabled,
}: WeeklyCheckInStatusPickerProps) {
  const options: WeeklyStatus[] = ["On Track", "Watch", "Intervention Required"];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as WeeklyStatus)}
      className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

export function WeeklyStatusBadge({ status }: { status: WeeklyStatus }) {
  return (
    <span
      className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const STATUS_ARC_LEGEND: { status: WeeklyStatus; label: string }[] = [
  { status: "On Track", label: "On Track" },
  { status: "Watch", label: "Watch" },
  { status: "Intervention Required", label: "Intervene" },
];

export function StatusArcLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto ${className}`}
      aria-label="Weekly status legend"
    >
      <span className="shrink-0 text-[9px] text-muted-foreground">Status:</span>
      {STATUS_ARC_LEGEND.map(({ status, label }) => (
        <span
          key={status}
          className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${STATUS_STYLES[status]}`}
          title={status}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

const CONFIDENCE_STYLES: Record<WeeklyConfidence, string> = {
  High: "border-success-border bg-success-soft text-success-fg",
  Medium: "border-warning-border bg-warning-soft text-warning",
  Low: "border-danger-border bg-danger-soft text-danger",
};

export const CONFIDENCE_DOT_STYLES: Record<WeeklyConfidence, string> = {
  High: "bg-success-fg",
  Medium: "bg-warning",
  Low: "bg-danger",
};

export function ConfidenceArcLegend({ className = "" }: { className?: string }) {
  const levels: WeeklyConfidence[] = ["High", "Medium", "Low"];
  return (
    <div
      className={`flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto ${className}`}
      aria-label="Confidence legend"
    >
      <span className="shrink-0 text-[9px] text-muted-foreground">Confidence:</span>
      {levels.map((level) => (
        <span
          key={level}
          className="inline-flex shrink-0 items-center gap-1 text-[9px] text-muted-foreground"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT_STYLES[level]}`} />
          {level}
        </span>
      ))}
    </div>
  );
}

export function WeeklyConfidenceBadge({ confidence }: { confidence: WeeklyConfidence }) {
  return (
    <span
      className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLES[confidence]}`}
    >
      {confidence}
    </span>
  );
}

interface ConfidencePickerProps {
  value: "High" | "Medium" | "Low";
  onChange: (v: "High" | "Medium" | "Low") => void;
  disabled?: boolean;
}

export function WeeklyConfidencePicker({ value, onChange, disabled }: ConfidencePickerProps) {
  const options = ["High", "Medium", "Low"] as const;
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as "High" | "Medium" | "Low")}
      className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

interface RecognitionPickerProps {
  value: "None" | "Appreciate" | "Appreciate Publicly";
  onChange: (v: "None" | "Appreciate" | "Appreciate Publicly") => void;
  disabled?: boolean;
}

export function WeeklyRecognitionPicker({ value, onChange, disabled }: RecognitionPickerProps) {
  const options = ["None", "Appreciate", "Appreciate Publicly"] as const;
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as "None" | "Appreciate" | "Appreciate Publicly")}
      className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
