export default function ReportLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Writing report
      </p>
    </div>
  );
}
