// Shared Excel + PDF export for Warin report screens.
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportCell = string | number | null | undefined;

export interface ExportColumn {
  header: string;
  /** Excel / PDF alignment hint for numeric columns */
  align?: "left" | "right" | "center";
}

export interface ReportExportInput {
  /** Report title shown in PDF header */
  title: string;
  /** Filename stem without date/extension, e.g. Resource_Deployment_Report */
  fileStem: string;
  /** Excel worksheet name (≤31 chars) */
  sheetName: string;
  columns: ExportColumn[];
  /** Data rows only — no blank padding. Values aligned to columns. */
  rows: ExportCell[][];
  /** Human-readable applied filters / period lines for PDF */
  filterLines?: string[];
  /** Optional totals/summary row (same length as columns) */
  totalsRow?: ExportCell[];
  orientation?: "portrait" | "landscape";
}

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatGeneratedAt(d = new Date()): string {
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim() || "Report";
  return cleaned.slice(0, 31);
}

function cellToExcel(value: ExportCell): string | number {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return String(value);
}

function cellToPdf(value: ExportCell): string | number {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return String(value);
}

/**
 * Summarize a multi-select filter for PDF metadata.
 * Returns null when the filter is effectively "all selected" and allLabel is used as skip.
 */
export function summarizeFilter(
  label: string,
  selected: readonly string[],
  all: readonly string[],
  options?: { allLabel?: string; emptyLabel?: string }
): string {
  const allLabel = options?.allLabel ?? `All ${label.toLowerCase()}`;
  const emptyLabel = options?.emptyLabel ?? "none";
  if (selected.length === 0) return `${label}: ${emptyLabel}`;
  if (all.length > 0 && selected.length >= all.length) return `${label}: ${allLabel}`;
  if (selected.length <= 4) return `${label}: ${selected.join(", ")}`;
  return `${label}: ${selected.length} of ${all.length}`;
}

export function exportReportExcel(input: ReportExportInput): void {
  const headers = input.columns.map((c) => c.header);
  const aoa: (string | number)[][] = [headers];

  for (const row of input.rows) {
    aoa.push(row.map(cellToExcel));
  }
  if (input.totalsRow) {
    aoa.push(input.totalsRow.map(cellToExcel));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Hint numeric columns for Excel display
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(input.sheetName));
  XLSX.writeFile(wb, `${input.fileStem}_${todayISODate()}.xlsx`);
}

export function exportReportPdf(input: ReportExportInput): void {
  const orientation = input.orientation ?? "landscape";
  const doc = new jsPDF({
    orientation,
    unit: "in",
    format: "letter",
  });

  const margin = 0.6;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = formatGeneratedAt();

  const head = [input.columns.map((c) => c.header)];
  const body = input.rows.map((row) => row.map(cellToPdf));
  const foot = input.totalsRow ? [input.totalsRow.map(cellToPdf)] : undefined;

  const columnStyles: Record<number, { halign?: "left" | "center" | "right" }> = {};
  input.columns.forEach((col, i) => {
    if (col.align) columnStyles[i] = { halign: col.align };
  });

  // Reserve space for title + meta above the table
  const filterBlock = (input.filterLines ?? []).filter(Boolean);
  const metaLines = [`Generated: ${generatedAt}`, ...filterBlock];
  const headerBlockHeight = 0.35 + metaLines.length * 0.18 + 0.1;

  autoTable(doc, {
    head,
    body,
    foot,
    startY: margin + headerBlockHeight,
    margin: { top: margin + headerBlockHeight, right: margin, bottom: 0.55, left: margin },
    showHead: "everyPage",
    showFoot: foot ? "lastPage" : "never",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 0.05,
      overflow: "linebreak",
      valign: "middle",
      textColor: [30, 30, 30],
      lineColor: [200, 200, 200],
      lineWidth: 0.01,
    },
    headStyles: {
      fillColor: [15, 40, 70],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    footStyles: {
      fillColor: [240, 242, 245],
      textColor: [20, 20, 20],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250],
    },
    columnStyles,
    didDrawPage: () => {
      // Title + filters on every page
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 40, 70);
      doc.text(input.title, margin, margin + 0.1);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      let y = margin + 0.32;
      for (const line of metaLines) {
        doc.text(line, margin, y, { maxWidth: pageWidth - margin * 2 });
        y += 0.16;
      }
    },
  });

  // Page numbers after all pages exist so totals are accurate
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 0.3, {
      align: "center",
    });
  }

  doc.save(`${input.fileStem}_${todayISODate()}.pdf`);
}

/** Run export and return a short success / error message for toast UI. */
export function runReportExport(
  kind: "excel" | "pdf",
  input: ReportExportInput
): { ok: true; message: string } | { ok: false; message: string } {
  try {
    if (kind === "excel") exportReportExcel(input);
    else exportReportPdf(input);
    const ext = kind === "excel" ? "xlsx" : "pdf";
    return { ok: true, message: `${kind === "excel" ? "Excel" : "PDF"} downloaded (${input.fileStem}_${todayISODate()}.${ext})` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `${kind === "excel" ? "Excel" : "PDF"} export failed: ${detail}` };
  }
}
