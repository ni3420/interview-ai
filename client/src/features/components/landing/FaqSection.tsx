const QUESTIONS = [
  {
    question: "What do I need to run a session?",
    answer:
      "A browser with microphone access and a stable connection. The lobby checks your camera and microphone before the interview starts, so a broken device is caught before the timer begins.",
  },
  {
    question: "How long does a session take?",
    answer:
      "30 minutes by default, with 15, 30, 45 and 60-minute options. The session ends automatically at the limit and the transcript is sent for scoring.",
  },
  {
    question: "What happens after I finish?",
    answer:
      "The transcript goes to a report job. The report scores each answer against a rubric and quotes the line behind every score. If the job fails, the report page offers a retry.",
  },
  {
    question: "Can I rejoin a session I left?",
    answer:
      "Yes. Reopening the interview restores the saved transcript, the answers already recorded and the next question index, so the session does not start over.",
  },
  {
    question: "Who can see my resume or transcript?",
    answer:
      "Only your account. There is no shared workspace, no recruiter seat and no public link. Files and transcripts are scoped to the signed-in user.",
  },
  {
    question: "Do I have to pay?",
    answer:
      "No. Early access is free and billing is not enabled, so no payment details are collected.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 border-b border-border py-14 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-signal">
            Questions
          </p>
          <h2 className="mt-4 font-display text-[30px] font-medium leading-[1.02] tracking-[-0.018em] text-foreground sm:text-[40px]">
            Before you upload anything.
          </h2>
        </div>

        <div className="lg:col-span-8">
          {QUESTIONS.map((item) => (
            <details
              key={item.question}
              className="group border-t border-border last:border-b"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="font-mono text-[15px] text-muted-foreground"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">&minus;</span>
                </span>
              </summary>
              <p className="max-w-[68ch] pb-4 text-[13.5px] leading-[1.6] text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
