import { HEALTH_LABELS } from "../data/executionReport";
import type { Project } from "../data/projects";

const PROJECT_TYPE_LABEL: Record<Project["type"], string> = {
  paid: "PAID",
  poc: "POC",
  product: "PRODUCT",
};

/** Display text for columns currently shown on the Projects grid (excludes Action). */
export function projectVisibleSearchFields(
  p: Project,
  visible: Set<string>,
  formatDate: (iso: string | null | undefined) => string,
  formatDateTime: (value: string | Date | null | undefined) => string
): Array<string | number | null | undefined> {
  const fields: Array<string | number | null | undefined> = [];

  if (visible.has("project")) {
    fields.push(p.name, p.customer, p.poNumber, PROJECT_TYPE_LABEL[p.type]);
  }
  if (visible.has("kickoff")) {
    fields.push(formatDate(p.kickoffDate));
  }
  if (visible.has("timeline")) {
    fields.push(formatDate(p.startDate), formatDate(p.endDate));
  }
  if (visible.has("milestones")) {
    if (p.milestones.length === 0) {
      fields.push("No milestones — allocations blocked");
    } else {
      for (const m of p.milestones) fields.push(m.name);
    }
  }
  if (visible.has("demand")) {
    fields.push(p.demand);
  }
  if (visible.has("health")) {
    fields.push(HEALTH_LABELS[p.health ?? "green"]);
  }
  if (visible.has("createdAt") && p.createdAt) {
    fields.push(formatDateTime(p.createdAt));
  }
  if (visible.has("modifiedAt") && p.modifiedAt) {
    fields.push(formatDateTime(p.modifiedAt));
  }
  if (visible.has("createdBy")) {
    fields.push(p.createdByName);
  }
  if (visible.has("modifiedBy")) {
    fields.push(p.modifiedByName);
  }

  return fields;
}
