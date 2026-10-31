"""Request/response contracts for the evidence-based interview report.

The report pipeline is authoritative: the client only supplies raw transcript
segments, and every derived field (status, criteria, weighted score) is produced
here. Model output is parsed into the ``LLM*`` models below, which are strict so
an incomplete or extra-key response never reaches storage.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

QuestionStatus = Literal["answered", "partial", "unanswered", "not_evaluable"]
EvaluatedStatus = Literal["answered", "partial"]
ExpectedAnswerSource = Literal["ai_generated", "stored_reference", "unavailable"]
CompletionStatus = Literal["complete", "partial", "insufficient_evidence"]


class SegmentInput(BaseModel):
    id: str = Field(..., min_length=1)
    speaker: Literal["interviewer", "candidate", "unknown"]
    start: float
    end: float
    text: str
    asr_confidence: float | None = Field(default=None, ge=0, le=1)
    speaker_confidence: float = Field(default=1, ge=0, le=1)


class QAPairInput(BaseModel):
    question_index: int = Field(..., ge=0)
    question: str
    answer: str
    reference_answer: str | None = None


class ReportRequest(BaseModel):
    interview_id: str = Field(..., min_length=1)
    job_description: str
    resume_text: str = ""
    qa_pairs: list[QAPairInput] = Field(default_factory=list)
    segments: list[SegmentInput] = Field(default_factory=list)


class CriterionEvaluation(BaseModel):
    id: str
    label: str
    score: float = Field(..., ge=0, le=10)
    weight: float = Field(..., ge=0, le=100)
    evidence: list[str]
    comment: str


class QuestionEvaluation(BaseModel):
    question_index: int = Field(..., ge=0)
    question: str
    answer: str
    status: QuestionStatus
    score: float | None = Field(default=None, ge=0, le=10)
    feedback: str
    expected_answer: str | None = None
    expected_answer_source: ExpectedAnswerSource = "unavailable"
    not_evaluable_reason: str | None = None
    evidence: list[str] = Field(default_factory=list)
    criteria: list[CriterionEvaluation] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    link_reasons: list[str] = Field(default_factory=list)


class ReportCounts(BaseModel):
    questions: int = Field(..., ge=0)
    answered: int = Field(..., ge=0)
    partial: int = Field(..., ge=0)
    unanswered: int = Field(..., ge=0)
    not_evaluable: int = Field(..., ge=0)
    evaluated: int = Field(..., ge=0)
    excluded_segments: int = Field(..., ge=0)


class SkillScores(BaseModel):
    technical_knowledge: float = Field(..., ge=0, le=10)
    problem_solving: float = Field(..., ge=0, le=10)
    communication: float = Field(..., ge=0, le=10)
    conceptual_understanding: float = Field(..., ge=0, le=10)
    relevance: float = Field(..., ge=0, le=10)


class QualityWarning(BaseModel):
    code: str
    message: str


class ReportResponse(BaseModel):
    overall_score: float | None = Field(default=None, ge=0, le=10)
    summary: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    question_scores: list[QuestionEvaluation]
    skill_scores: SkillScores | None = None
    counts: ReportCounts
    completion_status: CompletionStatus
    quality_warnings: list[QualityWarning] = Field(default_factory=list)
    prompt_version: str
    rubric_version: str
    score_scale: int = 10


# --- Strict model output ----------------------------------------------------


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LLMCriterion(_StrictModel):
    id: str
    score: float = Field(..., ge=0, le=10)
    evidence: list[str] = Field(default_factory=list)
    comment: str = ""


# The pipeline only asks about questions it already verified as evaluable, so a
# model label such as "rejected" or "unanswered" means "answered poorly", not
# "no answer". Map those labels onto the two statuses an evaluation can carry.
_STATUS_ALIASES = {
    "answered": "answered",
    "complete": "answered",
    "completed": "answered",
    "full": "answered",
    "fully_answered": "answered",
    "clear": "answered",
    "partial": "partial",
    "partially_answered": "partial",
    "incomplete": "partial",
    "rejected": "partial",
    "irrelevant": "partial",
    "off_topic": "partial",
    "does_not_answer": "partial",
    "unaddressed": "partial",
    "unanswered": "partial",
    "no_answer": "partial",
    "not_evaluable": "partial",
    "not_evaluated": "partial",
}


def _normalize_status(value: object) -> object:
    if not isinstance(value, str):
        return value
    key = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return _STATUS_ALIASES.get(key, value)


class LLMQuestion(_StrictModel):
    question_index: int = Field(..., ge=0)
    status: EvaluatedStatus
    criteria: list[LLMCriterion]
    strengths: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    feedback: str

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: object) -> object:
        return _normalize_status(value)


class LLMBatch(_StrictModel):
    questions: list[LLMQuestion]
    summary: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class LLMExpectedAnswer(_StrictModel):
    question_index: int = Field(..., ge=0)
    expected_answer: str


class LLMExpectedBatch(_StrictModel):
    answers: list[LLMExpectedAnswer]
