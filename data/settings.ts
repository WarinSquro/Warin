// System Parameters — owns the thresholds every working screen reads from.
// Changes are effective-dated (no history rewrite) and audit-logged.

export interface UtilBands {
  idleBelow: number;   // < this % = idle
  optimalTo: number;   // idle..this = optimal, above = overloaded
}

export interface MetricBands {
  excellent: number;      // >= this % = Excellent
  good: number;           // >= this % = Good
  needsAttention: number; // >= this % = Needs Attention; below = Critical
}

export interface SettingsState {
  bands: UtilBands;
  metricBands: MetricBands;
  capacityBasis: "billable" | "total";
  overallocationLimit: number; // % over 100 allowed before hard warning
  workingHoursPerDay: number;
  workingDays: string[];
  demandPriority: string[]; // ordered
  companyOffDays: CompanyOffDay[];
  /** Display pattern for dates across the app */
  dateFormat: DateFormatPattern;
}

export type DateFormatPattern = "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "dd-MMM-yyyy";

export interface CompanyOffDay {
  id: string;
  date: string; // ISO YYYY-MM-DD
  label: string;
}

export const DEFAULT_SETTINGS: SettingsState = {
  bands: { idleBelow: 70, optimalTo: 100 },
  metricBands: { excellent: 95, good: 90, needsAttention: 80 },
  capacityBasis: "billable",
  overallocationLimit: 120,
  workingHoursPerDay: 8.5,
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  demandPriority: ["Critical", "High", "Medium", "Low"],
  dateFormat: "dd/MM/yyyy",
  companyOffDays: [
    { id: "off1", date: "2026-01-01", label: "New Year's Day" },
    { id: "off2", date: "2026-01-26", label: "Republic Day" },
  ],
};

export const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A pending future-dated change (drives the scheduled-change banner elsewhere).
export interface ScheduledChange {
  id: string;
  field: string;
  from: string;
  to: string;
  effective: string;
}

function defaultScheduledEffectiveLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const SCHEDULED_CHANGES: ScheduledChange[] = [
  { id: "s1", field: "Optimal floor", from: "70%", to: "85%", effective: defaultScheduledEffectiveLabel() },
];

// Simulated impact of the pending edit — how many people shift bands.
export interface ImpactRow {
  band: string;
  before: number;
  after: number;
  tone: "danger" | "success" | "muted";
}

export const IMPACT_PREVIEW: ImpactRow[] = [
  { band: "Idle / Under", before: 14, after: 22, tone: "muted" },
  { band: "Optimal", before: 66, after: 58, tone: "success" },
  { band: "Overloaded", before: 6, after: 6, tone: "danger" },
];

export interface AuditEntry {
  id: string;
  who: string;
  what: string;
  when: string;
}

export const AUDIT_LOG: AuditEntry[] = [
  { id: "a1", who: "Anil Kumar", what: "Overallocation limit 115% → 120%", when: "Jan 3, 2026 · 2:14 PM" },
  { id: "a2", who: "Anil Kumar", what: "Capacity basis set to Billable", when: "Dec 28, 2025 · 10:02 AM" },
  { id: "a3", who: "Sara Khan (Admin)", what: "Added Saturday to working days, then reverted", when: "Dec 20, 2025 · 4:41 PM" },
];
