"use client";

import * as React from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/features/components/common/Button";

export interface DateRange {
  from: string;
  to: string;
}

export interface ExportToolbarProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  rows: Array<Record<string, string | number>>;
  filename?: string;
  onExportPdf?: () => void;
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ];
  return lines.join("\n");
}

export function ExportToolbar({
  range,
  onRangeChange,
  rows,
  filename = "interview-report.csv",
  onExportPdf,
}: ExportToolbarProps) {
  const handleExportCsv = React.useCallback(() => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [rows, filename]);

  const handleExportPdf = React.useCallback(() => {
    if (onExportPdf) {
      onExportPdf();
      return;
    }
    window.print();
  }, [onExportPdf]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Date range
        </span>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="sr-only">From</span>
          <input
            type="date"
            value={range.from}
            max={range.to || undefined}
            onChange={(event) =>
              onRangeChange({ ...range, from: event.target.value })
            }
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <span className="text-slate-400">–</span>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="sr-only">To</span>
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            onChange={(event) =>
              onRangeChange({ ...range, to: event.target.value })
            }
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
          leftIcon={<FileSpreadsheet className="h-4 w-4" />}
        >
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          leftIcon={<FileText className="h-4 w-4" />}
        >
          Export PDF
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
          aria-label="Download report"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default ExportToolbar;
