const METRICS = [
  {
    value: "5–7",
    label: "Questions per session",
    note: "Written from the role and the resume before you join",
  },
  {
    value: "30 min",
    label: "Default length",
    note: "15, 30, 45 or 60. The session ends itself, then the report starts",
  },
  {
    value: "0",
    label: "Recruiters with access",
    note: "Solo practice. No shared workspace, no seats, no audience",
  },
];

export function ProofBand() {
  return (
    <section className="border-b border-border py-12 lg:py-14">
      <div className="grid grid-cols-1 gap-6 rounded-[10px] border border-border bg-card px-5 py-6 sm:grid-cols-3 sm:gap-8 sm:px-6">
        {METRICS.map((metric) => (
          <div key={metric.label}>
            <p className="font-mono text-[30px] font-semibold leading-none tracking-[-0.02em] text-evidence">
              {metric.value}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
              {metric.label}
            </p>
            <p className="mt-1 text-[13.5px] leading-[1.6] text-muted-foreground">
              {metric.note}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ProofBand;
