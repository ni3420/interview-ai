const CAPABILITIES = [
  {
    title: "Questions from your material",
    description:
      "Every question is grounded in the resume you upload and the role description you paste in.",
  },
  {
    title: "A voice interviewer",
    description:
      "A live speech-to-speech agent asks the questions and responds to what you actually say.",
  },
  {
    title: "Follow-ups, not a script",
    description:
      "When an answer is thin, the interviewer probes instead of moving down a list.",
  },
  {
    title: "A transcript as you speak",
    description:
      "Answers are captured and saved in order, so a dropped connection does not erase the session.",
  },
  {
    title: "Evidence behind every score",
    description:
      "The report stores the line each rubric score is based on, so you can argue with it.",
  },
  {
    title: "Reopen a finished session",
    description:
      "Reload the room and the transcript, saved answers and next question index come back.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 border-b border-border py-14 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-signal">
            Capabilities
          </p>
          <h2 className="mt-4 font-display text-[30px] font-medium leading-[1.02] tracking-[-0.018em] text-foreground sm:text-[40px]">
            Built for the hour before the real thing.
          </h2>
          <p className="mt-4 max-w-[38ch] text-[13.5px] leading-[1.6] text-muted-foreground">
            Six things the product does today. Not a roadmap.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:col-span-8">
          {CAPABILITIES.map((capability, index) => (
            <li
              key={capability.title}
              className="border-t border-border py-5"
            >
              <div className="flex items-baseline gap-3">
                <span
                  className="font-mono text-[11px] font-semibold tabular-nums text-signal"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[16px] font-semibold leading-snug text-foreground">
                  {capability.title}
                </h3>
              </div>
              <p className="mt-1.5 pl-7 text-[13.5px] leading-[1.6] text-muted-foreground">
                {capability.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default FeatureGrid;
