export default function InterviewSetupLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div aria-hidden="true">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-9 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-10 h-44 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="mt-8 h-56 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="mt-8 h-12 animate-pulse rounded-lg bg-muted" />
      </div>
      <span role="status" className="sr-only">
        Loading setup
      </span>
    </div>
  );
}
