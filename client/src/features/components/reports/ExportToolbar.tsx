"use client";

import * as React from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
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

const inputClass =
  "h-9 rounded-md border border-border bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";

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
    <div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Range
        </span>
        <label>
          <span className="sr-only">From</span>
          <input
            type="date"
            value={range.from}
            max={range.to || undefined}
            onChange={(event) =>
              onRangeChange({ ...range, from: event.target.value })
            }
            className={inputClass}
          />
        </label>
        <span className="text-muted-foreground">to</span>
        <label>
          <span className="sr-only">To</span>
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            onChange={(event) =>
              onRangeChange({ ...range, to: event.target.value })
            }
            className={inputClass}
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
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          leftIcon={<FileText className="h-4 w-4" />}
        >
          PDF
        </Button>
      </div>
    </div>
  );
}

export default ExportToolbar;
