// Builds the question-by-question breakdown shown in the interview report.
//
// The persisted answers are the source of truth for what was actually asked in
// the live interview: each answer row stores the interviewer's real question
// (including runtime follow-ups) and the candidate's reply, keyed by the order
// they occurred (`questionIndex`). The AI plan (`interview.plan.questions`) only
// contains the initially generated questions, so it must not drive the report.
//
// Evaluation scores are matched onto answers by `questionIndex` when the model
// returns exact indices. Because the model is not guaranteed to honour 0-based
// indexing, we fall back to positional alignment when it returns exactly one
// score per answer. This keeps questions, answers, and feedback aligned even if
// the model numbers its output differently.

export interface AnswerLike {
  questionIndex: number;
  question: string;
  answer: string;
}

export interface QuestionScoreLike {
  questionIndex: number;
  score: number;
  feedback: string;
}

export interface QuestionBreakdownItem {
  questionIndex: number;
  question: string;
  answer: string;
  score?: number;
  feedback?: string;
}

/**
 * Merges consecutive answers that share the same question into a single entry
 * with the concatenated answer text.
 *
 * Older interviews stored one answer row per speech segment, which split a
 * single answer across several rows and showed the question repeatedly. This
 * collapses those rows so each question appears once with the candidate's
 * complete answer.
 */
export function mergeAnswersByQuestion(answers: AnswerLike[]): AnswerLike[] {
  const sorted = [...answers].sort(
    (a, b) => a.questionIndex - b.questionIndex
  );
  const merged: AnswerLike[] = [];

  for (const answer of sorted) {
    const previous = merged[merged.length - 1];
    const question = answer.question.trim();
    if (previous && question && previous.question.trim() === question) {
      previous.answer = `${previous.answer} ${answer.answer}`.trim();
      continue;
    }
    merged.push({ ...answer });
  }

  return merged;
}

export function buildQuestionBreakdown(
  answers: AnswerLike[],
  scores: QuestionScoreLike[] = [],
  planQuestions: string[] = []
): QuestionBreakdownItem[] {
  const orderedAnswers = mergeAnswersByQuestion(answers);

  const scoreByIndex = new Map<number, QuestionScoreLike>();
  for (const score of scores) {
    if (!scoreByIndex.has(score.questionIndex)) {
      scoreByIndex.set(score.questionIndex, score);
    }
  }

  const hasExactIndexMatch =
    orderedAnswers.length > 0 &&
    orderedAnswers.every((answer) => scoreByIndex.has(answer.questionIndex));

  // Only trust positional order when the model returned one score per answer;
  // otherwise a partial/mismatched set would be shown against the wrong answer.
  const usePositional =
    !hasExactIndexMatch && scores.length === orderedAnswers.length;
  const orderedScores = [...scores].sort(
    (a, b) => a.questionIndex - b.questionIndex
  );

  return orderedAnswers.map((answer, position) => {
    const score = usePositional
      ? orderedScores[position]
      : scoreByIndex.get(answer.questionIndex);

    const question =
      answer.question?.trim() ||
      planQuestions[answer.questionIndex] ||
      `Question ${answer.questionIndex + 1}`;

    return {
      questionIndex: answer.questionIndex,
      question,
      answer: answer.answer,
      score: score?.score,
      feedback: score?.feedback,
    };
  });
}
