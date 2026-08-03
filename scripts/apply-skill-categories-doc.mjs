/**
 * Upsert skill_categories into OneView_Table_Structure.xlsx (and FK column on skills).
 * Writes canonical file when unlocked; otherwise docs/OneView_Table_Structure_UPDATED.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonical = path.join(root, "docs", "OneView_Table_Structure.xlsx");
const updated = path.join(root, "docs", "OneView_Table_Structure_UPDATED.xlsx");
const src = fs.existsSync(updated) ? updated : canonical;

const wb = XLSX.readFile(src);
const idx = XLSX.utils.sheet_to_json(wb.Sheets["00_Index"], { header: 1, defval: "" });
const fields = XLSX.utils.sheet_to_json(wb.Sheets["01_Table_Fields"], { header: 1, defval: "" });

const hasSkillCat = idx.some((r) => String(r[1]) === "skill_categories");
if (!hasSkillCat) {
  const maxNo = Math.max(
    0,
    ...idx.slice(1).map((r) => (typeof r[0] === "number" ? r[0] : Number(r[0]) || 0))
  );
  idx.push([maxNo + 1, "skill_categories", "Skill category master (Skills Category dropdown)", 12]);
  wb.Sheets["00_Index"] = XLSX.utils.aoa_to_sheet(idx);
}

// Remove old skills.category rows and ensure category_id; append skill_categories fields if missing
const header = fields[0];
const out = [header];
let cur = null;
let skillsBuffer = [];
let flushingSkills = false;

function flushSkills() {
  if (!flushingSkills) return;
  const kept = skillsBuffer.filter((r) => String(r[3]) !== "category");
  const hasCatId = kept.some((r) => String(r[3]) === "category_id");
  if (!hasCatId) {
    // insert after name (field 3) typically
    const nameIdx = kept.findIndex((r) => String(r[3]) === "name");
    const row = ["", "", nameIdx >= 0 ? Number(kept[nameIdx][2]) + 1 : 3, "category_id", "BIGINT", "—", "—", "FK → skill_categories.id", "Required"];
    kept.splice(nameIdx >= 0 ? nameIdx + 1 : 2, 0, row);
    // renumber field nos within skills block
    let n = 1;
    for (const r of kept) {
      if (r[0] || r[1] || r[3]) {
        r[2] = n++;
      }
    }
  }
  out.push(...kept);
  skillsBuffer = [];
  flushingSkills = false;
}

for (let i = 1; i < fields.length; i++) {
  const r = [...fields[i]];
  if (r[1]) {
    flushSkills();
    cur = String(r[1]);
  }
  if (cur === "skills") {
    flushingSkills = true;
    skillsBuffer.push(r);
    continue;
  }
  out.push(r);
}
flushSkills();

if (!out.some((r) => String(r[1]) === "skill_categories" || (cur === "skill_categories" && r[3]))) {
  const tableNo =
    idx.find((r) => String(r[1]) === "skill_categories")?.[0] ??
    Math.max(...idx.slice(1).map((r) => Number(r[0]) || 0));
  const cats = [
    [tableNo, "skill_categories", 1, "id", "BIGINT", "—", "autoincrement()", "Surrogate identity PK", ""],
    ["", "", 2, "code", "TEXT / VARCHAR", "50", "—", "Business code (unique)", ""],
    ["", "", 3, "name", "TEXT / VARCHAR", "100", "—", "Category display name", ""],
    ["", "", 4, "status", "ENUM", "—", "active", "SetupStatus", ""],
    ["", "", 5, "is_active", "BOOLEAN", "—", "true", "", ""],
    ["", "", 6, "is_deleted", "BOOLEAN", "—", "false", "", ""],
    ["", "", 7, "deleted_at", "TIMESTAMP", "—", "NULL", "", ""],
    ["", "", 8, "created_at", "TIMESTAMP", "—", "now()", "", ""],
    ["", "", 9, "modified_at", "TIMESTAMP", "—", "updatedAt", "", ""],
    ["", "", 10, "created_by", "BIGINT", "—", "NULL", "", ""],
    ["", "", 11, "modified_by", "BIGINT", "—", "NULL", "", ""],
    ["", "", 12, "version", "INTEGER", "—", "1", "Optimistic concurrency", ""],
  ];
  out.push(...cats);
}

wb.Sheets["01_Table_Fields"] = XLSX.utils.aoa_to_sheet(out);

function writeSafe(target) {
  try {
    XLSX.writeFile(wb, target);
    return true;
  } catch {
    return false;
  }
}

if (writeSafe(canonical)) {
  console.log("Updated", canonical);
} else if (writeSafe(updated)) {
  console.log("Canonical locked; wrote", updated);
} else {
  console.error("Failed to write Excel");
  process.exit(1);
}
