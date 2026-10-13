export default function ReportLoading() {
  return (
    <div className="flex h-screen items-center justify-center flex-col gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-muted-foreground">Generating your interview report...</p>
    </div>
  );
}