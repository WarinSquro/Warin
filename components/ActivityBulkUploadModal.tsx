import { useRef, useState } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { createActivity, createActivityMilestone, fetchActivityMilestones } from "../api/domain";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { milestoneKindLabel, projectTypeLabel } from "../data/setup";
import {
  downloadActivityUploadTemplate,
  parseActivityWorkbook,
  type ParsedActivityRow,
} from "../utils/activityBulkUpload";

type Stage = "select" | "preview" | "importing" | "done";
type Outcome = { row: ParsedActivityRow; status: "success" | "failed"; message?: string };

export function ActivityBulkUploadModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { refresh } = useMasters();
  const [stage, setStage] = useState<Stage>("select");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedActivityRow[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusRef = useFocusFirstField<HTMLDivElement>(stage === "select");

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setFileError(null);
    const parsed = await parseActivityWorkbook(file);
    if (parsed.fileError) {
      setFileError(parsed.fileError);
      setRows([]);
      setStage("select");
      toast.error(parsed.fileError);
      return;
    }
    setRows(parsed.rows);
    setOutcomes([]);
    setStage("preview");
  };

  const runImport = async () => {
    setStage("importing");
    const results: Outcome[] = [];
    const milestoneCodeByKey = new Map<string, string>();
    let created = 0;
    const catalog = await fetchActivityMilestones().catch(() => []);
    for (const m of catalog) {
      milestoneCodeByKey.set(`${m.name.toLowerCase()}|${m.projectType}|${m.kind}`, m.id);
    }
    const catalogByNameType = new Map(catalog.map((m) => [`${m.name.toLowerCase()}|${m.projectType}`, m]));

    for (const row of validRows) {
      try {
        if (!row.kind) throw new Error("Missing milestone type");
        const key = `${row.milestoneName.toLowerCase()}|${row.projectType}|${row.kind}`;
        const nameTypeKey = `${row.milestoneName.toLowerCase()}|${row.projectType}`;
        const existingSameName = catalogByNameType.get(nameTypeKey);
        if (existingSameName && existingSameName.kind !== row.kind) {
          throw new Error(
            `Milestone "${row.milestoneName}" already exists as ${projectTypeLabel(existingSameName.projectType)} · ${milestoneKindLabel(existingSameName.kind)}`
          );
        }
        let milestoneCode = milestoneCodeByKey.get(key);
        if (!milestoneCode) {
          const ms = await createActivityMilestone({
            name: row.milestoneName,
            projectType: row.projectType,
            kind: row.kind,
          });
          milestoneCode = ms.id;
          milestoneCodeByKey.set(key, milestoneCode);
          catalogByNameType.set(nameTypeKey, ms);
        }
        await createActivity({
          name: row.activityName,
          billable: row.billable,
          milestoneCode,
        });
        created += 1;
        results.push({ row, status: "success" });
      } catch (e) {
        results.push({
          row,
          status: "failed",
          message: e instanceof Error ? e.message : "Import failed",
        });
      }
      setOutcomes([...results]);
    }
    try {
      await refresh();
    } catch {
      /* grid refresh is best-effort */
    }
    if (created > 0) toast.created();
    setStage("done");
  };

  const successCount = outcomes.filter((o) => o.status === "success").length;
  const failedCount = outcomes.filter((o) => o.status === "failed").length + errorRows.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div onClick={stage === "importing" ? undefined : onClose} className="absolute inset-0 bg-brand/40" />
      <div
        ref={focusRef}
        className="relative z-10 flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">Bulk upload activities</div>
          <button
            type="button"
            onClick={stage === "importing" ? undefined : onClose}
            disabled={stage === "importing"}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "select" && (
          <div className="flex flex-col gap-4 px-5 py-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center ${
                dragOver ? "border-primary bg-accent-soft" : "border-accent-line bg-accent-soft/40 hover:bg-accent-soft"
              }`}
            >
              <FileSpreadsheet className="h-9 w-9 text-primary" />
              <div className="text-[13px] font-medium text-foreground">
                Drop your XLS / XLSX / CSV file or click to browse
              </div>
              <div className="text-[11px] text-muted-foreground">
                Columns: Milestone, Milestone Type, Activity Type, Activity Name, Type
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {fileName && !fileError && (
              <div className="text-[11px] text-muted-foreground">Selected: {fileName}</div>
            )}
            {fileError && <div className="text-[12px] text-danger">{fileError}</div>}
            <button
              type="button"
              onClick={() => downloadActivityUploadTemplate()}
              className="cursor-pointer self-start text-[12px] text-primary hover:underline"
            >
              Download template
            </button>
          </div>
        )}

        {stage === "preview" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border-soft px-5 py-3 text-[12px] text-muted-foreground">
              {validRows.length} ready · {errorRows.length} with errors · {fileName}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {rows.slice(0, 80).map((r) => (
                <div key={r.rowNum} className="border-b border-border-soft py-2 last:border-0">
                  <div className="text-[12px] text-foreground">
                    Row {r.rowNum}: {r.activityName || "(no name)"} · {r.milestoneName || "(no milestone)"}{" "}
                    · {r.billable ? "Billable" : "Internal"}
                  </div>
                  {r.errors.length > 0 && (
                    <div className="text-[11px] text-danger">{r.errors.join("; ")}</div>
                  )}
                </div>
              ))}
              {rows.length > 80 && (
                <div className="py-2 text-[11px] text-muted-foreground">Showing first 80 rows.</div>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={validRows.length === 0}
                onClick={() => void runImport()}
                className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Import {validRows.length} row{validRows.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {(stage === "importing" || stage === "done") && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border-soft px-5 py-3 text-[12px] text-muted-foreground">
              {stage === "importing" ? "Importing…" : `Done · ${successCount} created · ${failedCount} failed`}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {outcomes.map((o) => (
                <div key={o.row.rowNum} className="border-b border-border-soft py-2 text-[12px] last:border-0">
                  <span className={o.status === "success" ? "text-success" : "text-danger"}>
                    Row {o.row.rowNum} {o.status}
                    {o.message ? ` — ${o.message}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {stage === "done" && (
              <div className="flex-shrink-0 border-t border-border-soft px-5 py-3.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
