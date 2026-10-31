"""Deterministic transcript analysis for the interview report.

This module owns every decision that must not depend on the model:

* classification of raw caption segments (parity with ``convex/transcriptText.ts``)
* which interviewer utterances are real questions
* how candidate speech is attached to a question by time window
* answered/partial/unanswered/not_evaluable after evaluation
* which segments are excluded from technical evaluation

The model only scores questions that already have verbatim candidate evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from app.schemas.report import ReportCounts, ReportRequest, SegmentInput

TranscriptKind = Literal[
    "answer_content",
    "greeting",
    "small_talk",
    "filler_only",
    "background",
    "noise",
    "unverified",
]
QuestionStatus = Literal["answered", "partial", "unanswered", "not_evaluable"]

# Candidate speech is only evidence when the speaker identity is reasonably
# certain. Stream captions currently provide either 1.0 or 0.0, but the
# threshold keeps this safe if confidence becomes continuous.
MIN_SPEAKER_CONFIDENCE = 0.5
LOW_ASR_CONFIDENCE = 0.6
# Consecutive interviewer captions closer than this are one question.
QUESTION_MERGE_GAP_SECONDS = 3.0

_FILLERS = {
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
}

_GREETING_PATTERNS = (
    re.compile(r"^(hi|hello|hey)( there)?$"),
    re.compile(r"^good (morning|afternoon|evening)$"),
    re.compile(r"^(nice|pleased|good) to meet you$"),
    re.compile(r"^how are you( today)?$"),
    re.compile(r"^how('s| is) it going$"),
    re.compile(r"^what('s| is) up$"),
    re.compile(r"^welcome( back)?$"),
)

_SMALL_TALK_PATTERNS = (
    re.compile(r"^(i'?m|i am) (good|fine|well|great|okay)[,.! ]*(thanks|thank you)?$"),
    re.compile(r"^(thanks|thank you)( for (joining|coming|your time))?$"),
    re.compile(r"^(can|could) you hear me$"),
    re.compile(r"^do you hear me$"),
    re.compile(r"^are you ready( to (start|begin))?$"),
    re.compile(r"^(shall|should) we (start|begin)$"),
    re.compile(r"^(let's|lets) (get started|begin|go)$"),
    re.compile(r"^see you( later|next time)?$"),
    re.compile(r"^have a (good|great|nice) day$"),
    re.compile(r"^good luck$"),
)

_NOISE_PATTERNS = (
    re.compile(r"^\[.*\]$"),
    re.compile(r"^\(.*\)$"),
    re.compile(
        r"^(music|applause|laughter|silence|inaudible|unintelligible|crosstalk|noise)$"
    ),
    re.compile(r"^[.?!…\-\s]+$"),
)

_UNVERIFIED_PATTERNS = (
    re.compile(r"\[(inaudible|unintelligible)\]", re.IGNORECASE),
    re.compile(r"(\?{3,}|\.{4,})"),
    re.compile(r"(.)\1{5,}"),
)

_QUESTION_CUES = (
    "?",
    "tell me",
    "describe",
    "explain",
    "walk me",
    "how ",
    "what ",
    "why ",
    "when ",
    "where ",
    "which ",
    "who ",
    "can you",
    "could you",
    "would you",
    "do you",
    "did you",
    "have you",
    "are you",
    "is there",
    "give me",
    "talk about",
    "share",
    "difference between",
)

_BACK_REFERENCE_PATTERNS = (
    re.compile(r"\bas i (said|mentioned|stated) (earlier|before)\b"),
    re.compile(r"\b(like|as) i mentioned (earlier|before)\b"),
    re.compile(r"\bgoing back to (your|the) (earlier|previous) question\b"),
    re.compile(r"\bregarding (your|the) (earlier|previous) question\b"),
)


def normalize_text(text: str) -> str:
    """Lower-case, strip punctuation and collapse whitespace."""
    lowered = text.lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9\s]", " ", lowered).strip()


def _tokens(text: str) -> list[str]:
    normalized = normalize_text(text)
    return normalized.split() if normalized else []


def _matches(patterns: tuple[re.Pattern[str], ...], value: str) -> bool:
    return any(pattern.search(value) for pattern in patterns)


def classify_segment(
    text: str, speaker: str, asr_confidence: float | None = None
) -> TranscriptKind:
    """Classify one segment exactly as the Convex write path does."""
    raw = text.strip()
    normalized = normalize_text(raw)

    if not raw:
        return "noise"
    if speaker == "unknown":
        return "background"

    words = _tokens(raw)
    if not words or _matches(_NOISE_PATTERNS, normalized) or len(raw) < 2:
        return "noise"

    if _matches(_UNVERIFIED_PATTERNS, raw) or (
        isinstance(asr_confidence, (int, float)) and asr_confidence < 0.4
    ):
        return "unverified"

    if _matches(_GREETING_PATTERNS, normalized):
        return "greeting"
    if _matches(_SMALL_TALK_PATTERNS, normalized):
        return "small_talk"
    if all(word in _FILLERS for word in words):
        return "filler_only"
    return "answer_content"


def looks_like_question(text: str) -> bool:
    """Whether an interviewer utterance asks the candidate something."""
    lowered = text.lower()
    return any(cue in lowered for cue in _QUESTION_CUES)


def has_back_reference(text: str) -> bool:
    normalized = normalize_text(text)
    return _matches(_BACK_REFERENCE_PATTERNS, normalized)


def normalize_quote(text: str) -> str:
    """Whitespace-normalized form used for evidence substring validation."""
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class NormalizedSegment:
    id: str
    speaker: str
    start: float
    end: float
    text: str
    asr_confidence: float | None
    speaker_confidence: float
    kind: TranscriptKind


@dataclass
class PlannedQuestion:
    question_index: int
    question: str
    answer: str
    status: QuestionStatus
    evaluable: bool
    reason: str | None = None
    evidence: list[str] = field(default_factory=list)
    reference_answer: str | None = None
    link_reasons: list[str] = field(default_factory=list)
    source: Literal["transcript", "legacy_answers"] = "transcript"


@dataclass
class AnalysisResult:
    questions: list[PlannedQuestion]
    warnings: list[tuple[str, str]]
    total_segments: int
    excluded_segments: int


def _normalize_segments(request: ReportRequest) -> list[NormalizedSegment]:
    segments: list[NormalizedSegment] = []
    for segment in request.segments:
        kind = classify_segment(
            segment.text, segment.speaker, segment.asr_confidence
        )
        segments.append(
            NormalizedSegment(
                id=segment.id,
                speaker=segment.speaker,
                start=segment.start,
                end=segment.end,
                text=segment.text.strip(),
                asr_confidence=segment.asr_confidence,
                speaker_confidence=segment.speaker_confidence,
                kind=kind,
            )
        )
    segments.sort(key=lambda segment: (segment.start, segment.end, segment.id))
    return segments


def _eligible_candidate(segment: NormalizedSegment) -> bool:
    return (
        segment.speaker == "candidate"
        and segment.speaker_confidence >= MIN_SPEAKER_CONFIDENCE
        and segment.kind == "answer_content"
    )


def _extract_questions(
    segments: list[NormalizedSegment],
) -> list[dict[str, object]]:
    """Merge consecutive interviewer content into candidate questions."""
    candidates: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    previous_interviewer_end: float | None = None

    def flush() -> None:
        nonlocal current
        if current is not None and looks_like_question(str(current["text"])):
            candidates.append(current)
        current = None

    for segment in segments:
        is_interviewer_content = (
            segment.speaker == "interviewer" and segment.kind == "answer_content"
        )
        if not is_interviewer_content:
            previous_interviewer_end = None
            continue

        if (
            current is not None
            and previous_interviewer_end is not None
            and segment.start - previous_interviewer_end <= QUESTION_MERGE_GAP_SECONDS
            and (
                looks_like_question(str(current["text"]))
                or not looks_like_question(segment.text)
            )
        ):
            current["text"] = f"{current['text']} {segment.text}".strip()
            current["end"] = segment.end
        else:
            flush()
            current = {
                "text": segment.text,
                "start": segment.start,
                "end": segment.end,
            }
        previous_interviewer_end = segment.end

    flush()
    return candidates


def _reference_for_question(
    question: str, position: int, request: ReportRequest
) -> str | None:
    normalized = normalize_text(question)
    if not normalized:
        return None

    by_text = {
        normalize_text(pair.question): pair.reference_answer
        for pair in request.qa_pairs
        if pair.reference_answer
    }
    if normalized in by_text and by_text[normalized]:
        return by_text[normalized]

    ordered = sorted(request.qa_pairs, key=lambda pair: pair.question_index)
    if position < len(ordered):
        pair = ordered[position]
        if normalize_text(pair.question) == normalized and pair.reference_answer:
            return pair.reference_answer
    return None


def _analyze_transcript(request: ReportRequest) -> AnalysisResult:
    segments = _normalize_segments(request)
    extracted = _extract_questions(segments)

    planned: list[PlannedQuestion] = []
    used_ids: set[str] = set()

    for position, item in enumerate(extracted):
        window_start = float(item["start"])
        window_end = (
            float(extracted[position + 1]["start"])
            if position + 1 < len(extracted)
            else float("inf")
        )
        content: list[NormalizedSegment] = []
        unverified = False
        background = False
        low_confidence_candidate = False

        for segment in segments:
            if not (window_start <= segment.start < window_end):
                continue
            if segment.speaker == "candidate":
                if segment.speaker_confidence < MIN_SPEAKER_CONFIDENCE:
                    low_confidence_candidate = True
                elif segment.kind == "unverified":
                    unverified = True
                elif _eligible_candidate(segment):
                    content.append(segment)
            elif segment.speaker == "unknown":
                background = True

        answer = " ".join(segment.text for segment in content if segment.text).strip()
        reason: str | None = None
        status: QuestionStatus
        evaluable = False

        if answer:
            status = "answered"
            evaluable = True
            used_ids.update(segment.id for segment in content)
        elif unverified or low_confidence_candidate:
            status = "not_evaluable"
            reason = "Candidate speech was not reliably transcribed or attributed."
        elif background:
            status = "not_evaluable"
            reason = "Speech in this answer window could not be attributed to the candidate."
        else:
            status = "unanswered"
            reason = "The candidate did not provide a verifiable answer."

        planned.append(
            PlannedQuestion(
                question_index=position,
                question=str(item["text"]),
                answer=answer,
                status=status,
                evaluable=evaluable,
                reason=reason,
                evidence=[segment.text for segment in content] if answer else [],
                reference_answer=_reference_for_question(
                    str(item["text"]), position, request
                ),
            )
        )

    # Explicit back-references are the only case where one segment may support
    # more than one question. Record why so the report can explain the link.
    for position in range(1, len(planned)):
        target = planned[position - 1]
        source = planned[position]
        if not source.evaluable:
            continue
        source_start = float(extracted[position]["start"])
        source_end = (
            float(extracted[position + 1]["start"])
            if position + 1 < len(extracted)
            else float("inf")
        )
        for segment in segments:
            if (
                segment.id in used_ids
                and _eligible_candidate(segment)
                and source_start <= segment.start < source_end
                and has_back_reference(segment.text)
                and segment.text not in target.evidence
            ):
                target.answer = f"{target.answer} {segment.text}".strip()
                target.evidence.append(segment.text)
                target.link_reasons.append(
                    "Candidate explicitly referenced the previous question: "
                    f'"{segment.text}"'
                )
                if target.status in ("unanswered", "not_evaluable"):
                    target.status = "answered"
                    target.evaluable = True
                    target.reason = None
                    used_ids.add(segment.id)

    warnings: list[tuple[str, str]] = []
    unknown_count = sum(1 for segment in segments if segment.speaker == "unknown")
    if unknown_count:
        warnings.append(
            (
                "background_speaker_excluded",
                f"{unknown_count} segment(s) from an unidentified speaker were "
                "excluded from evaluation.",
            )
        )
    unverified_count = sum(
        1
        for segment in segments
        if segment.kind == "unverified"
        or (
            segment.speaker == "candidate"
            and segment.speaker_confidence < MIN_SPEAKER_CONFIDENCE
        )
    )
    if unverified_count:
        warnings.append(
            (
                "unverified_transcript",
                f"{unverified_count} segment(s) could not be verified and were "
                "not used as evidence.",
            )
        )
    low_asr_count = sum(
        1
        for segment in segments
        if segment.asr_confidence is not None
        and segment.asr_confidence < LOW_ASR_CONFIDENCE
    )
    if low_asr_count:
        warnings.append(
            (
                "low_asr_confidence",
                f"{low_asr_count} segment(s) had low transcription confidence; "
                "the wording may be imperfect.",
            )
        )

    excluded = sum(
        1
        for segment in segments
        if segment.id not in used_ids and segment.speaker != "interviewer"
    )
    return AnalysisResult(
        questions=planned,
        warnings=warnings,
        total_segments=len(segments),
        excluded_segments=excluded,
    )


def window_start_for(
    extracted: list[dict[str, object]], position: int
) -> float:
    return float(extracted[position]["start"])


def _analyze_legacy_answers(request: ReportRequest) -> AnalysisResult:
    ordered = sorted(request.qa_pairs, key=lambda pair: pair.question_index)
    planned: list[PlannedQuestion] = []

    for position, pair in enumerate(ordered):
        question = pair.question.strip()
        answer = pair.answer.strip()
        kind = classify_segment(answer, "candidate") if answer else "noise"
        status: QuestionStatus
        reason: str | None = None

        if not answer:
            status = "unanswered"
            reason = "No answer was recorded for this question."
        elif kind == "unverified":
            status = "not_evaluable"
            reason = "The stored answer could not be verified."
        elif kind in {"greeting", "small_talk", "filler_only", "noise"}:
            status = "unanswered"
            reason = "The stored answer contains no evaluable content."
        else:
            status = "answered"

        evaluable = status == "answered"
        planned.append(
            PlannedQuestion(
                question_index=pair.question_index,
                question=question or f"Question {position + 1}",
                answer=answer,
                status=status,
                evaluable=evaluable,
                reason=reason,
                evidence=[answer] if evaluable else [],
                reference_answer=pair.reference_answer,
                source="legacy_answers",
            )
        )

    return AnalysisResult(
        questions=planned,
        warnings=[
            (
                "legacy_transcript_fallback",
                "No transcript segments were stored for this interview; the "
                "report uses the saved question and answer text.",
            )
        ],
        total_segments=0,
        excluded_segments=0,
    )


def analyze_request(request: ReportRequest) -> AnalysisResult:
    """Analyze either raw segments or the legacy saved Q&A rows."""
    if request.segments:
        return _analyze_transcript(request)
    return _analyze_legacy_answers(request)


def compute_counts(
    questions: list[PlannedQuestion], excluded_segments: int
) -> ReportCounts:
    counts = {
        "answered": 0,
        "partial": 0,
        "unanswered": 0,
        "not_evaluable": 0,
    }
    evaluated = 0
    for question in questions:
        counts[question.status] += 1
        if question.evaluable and question.status in {"answered", "partial"}:
            evaluated += 1

    return ReportCounts(
        questions=len(questions),
        answered=counts["answered"],
        partial=counts["partial"],
        unanswered=counts["unanswered"],
        not_evaluable=counts["not_evaluable"],
        evaluated=evaluated,
        excluded_segments=excluded_segments,
    )
