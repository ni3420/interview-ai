// Deterministic classification of a finalized caption segment.
//
// This is the stored classification, used by the report pipeline as evidence
// about what kind of speech a segment is. The AI service re-derives the same
// categories before evaluating, so a client cannot promote background speech
// into an answer by labelling it.

export type TranscriptSpeaker = "interviewer" | "candidate" | "unknown";

export type TranscriptSegmentKind =
  | "answer_content"
  | "greeting"
  | "small_talk"
  | "filler_only"
  | "background"
  | "noise"
  | "unverified";

const FILLERS = new Set([
  "um",
  "umm",
  "uh",
  "uhh",
  "uhm",
  "hmm",
  "hm",
  "mm",
  "erm",
  "er",
  "ah",
  "eh",
  "like",
  "youknow",
  "okay",
  "ok",
  "so",
  "well",
]);

// Anchored so a real question that merely starts with "hi" ("Hi, tell me about
// React") is not thrown away as a greeting.
const GREETING_PATTERNS = [
  /^(hi|hello|hey)( there)?$/,
  /^good (morning|afternoon|evening)$/,
  /^(nice|pleased|good) to meet you$/,
  /^how are you( today)?$/,
  /^how('s| is) it going$/,
  /^what('s| is) up$/,
  /^welcome( back)?$/,
];

const SMALL_TALK_PATTERNS = [
  /^(i'?m|i am) (good|fine|well|great|okay)[,.! ]*(thanks|thank you)?$/,
  /^(thanks|thank you)( for (joining|coming|your time))?$/,
  /^(can|could) you hear me$/,
  /^do you hear me$/,
  /^are you ready( to (start|begin))?$/,
  /^(shall|should) we (start|begin)$/,
  /^(let's|lets) (get started|begin|go)$/,
  /^see you( later|next time)?$/,
  /^have a (good|great|nice) day$/,
  /^good luck$/,
];

const NOISE_PATTERNS = [
  /^\[.*\]$/,
  /^\(.*\)$/,
  /^(music|applause|laughter|silence|inaudible|unintelligible|crosstalk|noise)$/,
  /^[.?!…\-\s]+$/,
];

const UNVERIFIED_PATTERNS = [
  /\[(inaudible|unintelligible)\]/i,
  /(\?{3,}|\.{4,})/,
  /(.)\1{5,}/,
];

/**
 * Lower-cases, strips punctuation and collapses whitespace. Apostrophes are
 * removed so "I'm good" and "Im good" classify the same way.
 */
export function normalizeSegmentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  const normalized = normalizeSegmentText(text);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

function matchesAny(patterns: RegExp[], normalized: string): boolean {
  return patterns.some((pattern) => pattern.test(normalized));
}

/**
 * Classifies one segment. `unknown` speakers are always background: an
 * unverified identity is never promoted to the candidate.
 */
export function classifyTranscriptSegment(
  text: string,
  speaker: TranscriptSpeaker,
  asrConfidence?: number
): TranscriptSegmentKind {
  const raw = text.trim();
  const normalized = normalizeSegmentText(raw);

  if (raw.length === 0) return "noise";
  if (speaker === "unknown") return "background";

  const words = tokens(raw);
  if (
    words.length === 0 ||
    matchesAny(NOISE_PATTERNS, normalized) ||
    raw.length < 2
  ) {
    return "noise";
  }

  if (
    matchesAny(UNVERIFIED_PATTERNS, raw) ||
    (typeof asrConfidence === "number" && asrConfidence < 0.4)
  ) {
    return "unverified";
  }

  if (matchesAny(GREETING_PATTERNS, normalized)) return "greeting";
  if (matchesAny(SMALL_TALK_PATTERNS, normalized)) return "small_talk";

  if (words.every((word) => FILLERS.has(word))) return "filler_only";

  return "answer_content";
}
