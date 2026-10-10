export default function InterviewSetupLoading() {
  return (
    <div className="container max-w-3xl py-8">
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-3/4" />
          <div className="mt-4 h-4 bg-muted rounded w-1/2" />
        </div>
        <div className="animate-pulse">
          <div className="h-64 bg-muted rounded-lg" />
        </div>
        <div className="animate-pulse">
          <div className="h-40 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}