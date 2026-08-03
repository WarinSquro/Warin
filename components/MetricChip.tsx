import { metricBand, metricBandLabel } from "../data/deploymentReport";
import type { MetricBand } from "../data/deploymentReport";
import { useSettings } from "../context/SettingsContext";

const BAND_STYLES: Record<MetricBand, string> = {
  excellent: "border-success-border bg-success-soft text-success",
  good: "border-accent-line bg-accent-soft text-accent-softfg",
  needs_attention: "border-warning-border bg-warning-soft text-warning",
  critical: "border-danger-border bg-danger-soft text-danger",
  not_available: "border-border bg-surface-alt text-muted-foreground",
};

export function MetricChip({ value }: { value?: number }) {
  const { settings } = useSettings();
  const band = metricBand(value, settings.metricBands);

  if (band === "not_available") {
    return (
      <span
        className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-medium ${BAND_STYLES.not_available}`}
      >
        Not Available
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${BAND_STYLES[band]}`}
    >
      <span>{value}%</span>
      <span className="opacity-80">· {metricBandLabel(band)}</span>
    </span>
  );
}
