"""Model-backed evaluation with code-owned scoring and evidence checks.

The model is asked for per-criterion sub-scores only. Everything else — the
weighted question score, the overall score, skill aggregates, completion status,
and whether an evidence quote is real — is computed or validated here.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Sequence

from pydantic import ValidationError

from app.ai.prompts.report import (
    REPORT_PROMPT_VERSION,
    build_evaluation_prompt,
    build_expected_answer_prompt,
)
from app.core.config import settings
from app.core.rubric import (
    RUBRIC_VERSION,
    Criterion,
    active_rubric,
)
from app.schemas.report import (
    CriterionEvaluation,
    LLMBatch,
    LLMExpectedBatch,
    LLMQuestion,
    QuestionEvaluation,
    QualityWarning,
    ReportResponse,
    ReportRequest,
    SkillScores,
)
from app.services.report_pipeline import (
    AnalysisResult,
    PlannedQuestion,
    analyze_request,
    compute_counts,
    normalize_quote,
)

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 2
MAX_EVIDENCE_QUOTE_CHARS = 500

# Small local models often label a criterion slightly differently. Map those
# labels onto the canonical rubric id instead of rejecting an otherwise valid
# evaluation; anything outside this map still fails validation.
_CRITERION_ALIASES = {
    "technical": "technical_correctness",
    "technical_knowledge": "technical_correctness",
    "correctness": "technical_correctness",
    "relevant": "relevance",
    "conceptual": "conceptual_understanding",
    "understanding": "conceptual_understanding",
    "complete": "completeness",
    "practical_experience": "problem_solving",
    "problem_solving_experience": "problem_solving",
    "problem_solving_practical_experience": "problem_solving",
    "communication_clarity": "communication",
    "clarity": "communication",
}


def normalize_criterion_id(value: str) -> str:
    """Lowercase, snake_case and alias a model-supplied criterion id."""
    key = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return _CRITERION_ALIASES.get(key, key)


class ReportEvaluationError(RuntimeError):
    """A stable, user-safe failure that must never be persisted as a report."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class _InvalidModelOutput(Exception):
    """Internal signal that a response failed validation and may be retried."""


def parse_json_object(raw: str) -> dict:
    """Parse a JSON object, tolerating a code fence or surrounding prose."""
    try:
        data = json.loads(raw.strip())
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            raise _InvalidModelOutput("Response was not JSON") from None
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as error:
            raise _InvalidModelOutput("Response was not valid JSON") from error

    if not isinstance(data, dict):
        raise _InvalidModelOutput("Response was not a JSON object")
    return data


def _clean_list(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        text = value.strip()
        if text and text not in seen:
            seen.add(text)
            cleaned.append(text)
    return cleaned


async def _call_model(provider, prompt: str) -> str:
    return await provider.generate(
        prompt,
        temperature=settings.report_temperature,
        max_tokens=settings.report_max_tokens,
        seed=settings.report_seed,
    )


async def generate_expected_answers(
    provider, request: ReportRequest, questions: Sequence[PlannedQuestion]
) -> dict[int, str]:
    """Generate labelled reference answers; failure is never fatal."""
    targets = [
        question
        for question in questions
        if question.evaluable and not question.reference_answer
    ]
    if not targets:
        return {}

    prompt = build_expected_answer_prompt(
        resume_text=request.resume_text,
        job_description=request.job_description,
        questions=[
            {
                "question_index": question.question_index,
                "question": question.question,
            }
            for question in targets
        ],
    )
    try:
        data = parse_json_object(await _call_model(provider, prompt))
        batch = LLMExpectedBatch.model_validate(data)
    except Exception as error:  # noqa: BLE001 - reference answers are optional
        logger.warning("Expected-answer generation failed: %s", error)
        return {}

    expected = {
        item.question_index: item.expected_answer.strip()
        for item in batch.answers
        if item.expected_answer.strip()
    }
    return {
        question.question_index: expected[question.question_index]
        for question in targets
        if question.question_index in expected
    }


def _validate_batch(
    batch: LLMBatch, questions: Sequence[PlannedQuestion], rubric: Sequence[Criterion]
) -> None:
    evaluable = [question for question in questions if question.evaluable]
    expected = {question.question_index for question in evaluable}
    returned = [item.question_index for item in batch.questions]

    if len(returned) != len(set(returned)):
        raise _InvalidModelOutput("Duplicate question entries")
    if set(returned) != expected:
        raise _InvalidModelOutput(
            f"Question indices {sorted(returned)} do not match {sorted(expected)}"
        )

    rubric_ids = {criterion.id for criterion in rubric}
    by_index = {question.question_index: question for question in evaluable}

    for item in batch.questions:
        question = by_index[item.question_index]
        criteria_ids = [
            normalize_criterion_id(criterion.id) for criterion in item.criteria
        ]
        if len(criteria_ids) != len(set(criteria_ids)):
            raise _InvalidModelOutput(
                f"Duplicate criteria for question {item.question_index}"
            )
        if set(criteria_ids) != rubric_ids:
            raise _InvalidModelOutput(
                f"Criteria for question {item.question_index} do not match the "
                f"rubric: got {sorted(set(criteria_ids))}, "
                f"expected {sorted(rubric_ids)}"
            )

        normalized_answer = normalize_quote(question.answer)
        quotes: list[str] = []
        for criterion in item.criteria:
            for quote in criterion.evidence:
                cleaned = normalize_quote(quote)
                if not cleaned:
                    continue
                if len(cleaned) > MAX_EVIDENCE_QUOTE_CHARS:
                    raise _InvalidModelOutput("Evidence quote is too long")
                if cleaned not in normalized_answer:
                    raise _InvalidModelOutput(
                        f"Evidence is not a verbatim quote for question "
                        f"{item.question_index}"
                    )
                quotes.append(cleaned)

        if not quotes:
            raise _InvalidModelOutput(
                f"No evidence quotes for question {item.question_index}"
            )


def _weighted_question(
    item: LLMQuestion, rubric: Sequence[Criterion]
) -> tuple[float, list[CriterionEvaluation]]:
    by_id = {
        normalize_criterion_id(criterion.id): criterion
        for criterion in item.criteria
    }
    criteria: list[CriterionEvaluation] = []
    total = 0.0

    for criterion in rubric:
        result = by_id[criterion.id]
        total += result.score * criterion.weight / 100
        criteria.append(
            CriterionEvaluation(
                id=criterion.id,
                label=criterion.label,
                score=round(result.score, 2),
                weight=criterion.weight,
                evidence=[
                    normalize_quote(quote)
                    for quote in result.evidence
                    if normalize_quote(quote)
                ],
                comment=result.comment.strip(),
            )
        )

    return round(total, 2), criteria


def _mean(values: Sequence[float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _skill_scores(
    evaluated: Sequence[tuple[LLMQuestion, list[CriterionEvaluation]]],
) -> SkillScores | None:
    if not evaluated:
        return None

    def criterion_scores(criterion_id: str) -> list[float]:
        return [
            criterion.score
            for _, criteria in evaluated
            for criterion in criteria
            if criterion.id == criterion_id
        ]

    return SkillScores(
        technical_knowledge=_mean(criterion_scores("technical_correctness")),
        problem_solving=_mean(criterion_scores("problem_solving")),
        communication=_mean(criterion_scores("communication")),
        conceptual_understanding=_mean(criterion_scores("conceptual_understanding")),
        relevance=_mean(criterion_scores("relevance")),
    )


async def _evaluate_with_model(
    provider,
    request: ReportRequest,
    questions: Sequence[PlannedQuestion],
    rubric: Sequence[Criterion],
) -> LLMBatch:
    evaluable = [question for question in questions if question.evaluable]
    base_prompt = build_evaluation_prompt(
        rubric=rubric,
        resume_text=request.resume_text,
        job_description=request.job_description,
        questions=[
            {
                "question_index": question.question_index,
                "question": question.question,
                "answer": question.answer,
                "evidence": question.evidence,
                "reference_answer": question.reference_answer,
            }
            for question in evaluable
        ],
    )
    required_ids = ", ".join(criterion.id for criterion in rubric)
    prompt = base_prompt

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            data = parse_json_object(await _call_model(provider, prompt))
            batch = LLMBatch.model_validate(data)
            _validate_batch(batch, questions, rubric)
            return batch
        except (ValidationError, ValueError, _InvalidModelOutput) as error:
            last_error = error
            logger.warning(
                "Report evaluation attempt %s/%s rejected: %s",
                attempt,
                MAX_ATTEMPTS,
                error,
            )
            prompt = (
                f"{base_prompt}\n"
                f"The previous response was rejected: {error}.\n"
                "Return the same JSON shape and fix that problem. Every "
                'question\'s "criteria" array must contain exactly these ids, '
                f"each once and nothing else: {required_ids}. Every question "
                'must use status "answered" or "partial", and every criterion '
                "must include at least one exact quote from that question's "
                "candidate_answer in its evidence array."
            )

    raise ReportEvaluationError(
        "invalid_model_output",
        f"The evaluation model returned unusable output: {last_error}",
    )


def _expected_answer_for(
    question: PlannedQuestion, generated: dict[int, str]
) -> tuple[str | None, str]:
    if question.reference_answer:
        return question.reference_answer, "stored_reference"
    generated_answer = generated.get(question.question_index)
    if generated_answer:
        return generated_answer, "ai_generated"
    return None, "unavailable"


def _build_question(
    question: PlannedQuestion,
    model_result: LLMQuestion | None,
    generated: dict[int, str],
) -> tuple[QuestionEvaluation, tuple[LLMQuestion, list[CriterionEvaluation]] | None]:
    expected_answer, expected_source = _expected_answer_for(question, generated)

    if model_result is None or not question.evaluable:
        reason = question.reason or "The answer could not be evaluated."
        return (
            QuestionEvaluation(
                question_index=question.question_index,
                question=question.question,
                answer=question.answer,
                status=question.status,
                score=None,
                feedback=f"Not evaluated: {reason}",
                expected_answer=expected_answer,
                expected_answer_source=expected_source,
                not_evaluable_reason=(
                    reason if question.status == "not_evaluable" else None
                ),
                evidence=[],
                criteria=[],
                strengths=[],
                missing_points=[],
                link_reasons=question.link_reasons,
            ),
            None,
        )

    rubric = active_rubric()
    score, criteria = _weighted_question(model_result, rubric)
    evidence = _clean_list(
        quote for criterion in criteria for quote in criterion.evidence
    )

    return (
        QuestionEvaluation(
            question_index=question.question_index,
            question=question.question,
            answer=question.answer,
            status=model_result.status,
            score=score,
            feedback=model_result.feedback.strip(),
            expected_answer=expected_answer,
            expected_answer_source=expected_source,
            evidence=evidence,
            criteria=criteria,
            strengths=_clean_list(model_result.strengths),
            missing_points=_clean_list(model_result.missing_points),
            link_reasons=question.link_reasons,
        ),
        (model_result, criteria),
    )


async def build_report(
    request: ReportRequest, provider
) -> ReportResponse:
    """Run the full pipeline and return a validated, code-scored report."""
    rubric = active_rubric()
    analysis: AnalysisResult = analyze_request(request)

    for question in analysis.questions:
        if question.status == "partial":
            question.evaluable = True

    generated = await generate_expected_answers(provider, request, analysis.questions)

    batch: LLMBatch | None = None
    if any(question.evaluable for question in analysis.questions):
        batch = await _evaluate_with_model(
            provider, request, analysis.questions, rubric
        )

    model_by_index = (
        {item.question_index: item for item in batch.questions} if batch else {}
    )

    # The model may refine an "answered" question to "partial"; carry that back
    # into the planned question so counts and completion status agree.
    for question in analysis.questions:
        model_result = model_by_index.get(question.question_index)
        if model_result is not None and question.evaluable:
            question.status = model_result.status
            question.evaluable = True

    question_scores: list[QuestionEvaluation] = []
    evaluated: list[tuple[LLMQuestion, list[CriterionEvaluation]]] = []
    for question in analysis.questions:
        evaluation, scored = _build_question(
            question, model_by_index.get(question.question_index), generated
        )
        question_scores.append(evaluation)
        if scored is not None:
            evaluated.append(scored)

    if evaluated:
        question_numbers = [evaluation.score for evaluation in question_scores]
        scored_values = [score for score in question_numbers if score is not None]
        overall_score = round(sum(scored_values) / len(scored_values), 2)
        skill_scores = _skill_scores(evaluated)
    else:
        overall_score = None
        skill_scores = None

    counts = compute_counts(analysis.questions, analysis.excluded_segments)

    warnings = [
        QualityWarning(code=code, message=message) for code, message in analysis.warnings
    ]
    if counts.unanswered or counts.not_evaluable:
        warnings.append(
            QualityWarning(
                code="partial_evaluation",
                message=(
                    f"{counts.unanswered + counts.not_evaluable} question(s) had "
                    "no verifiable answer and were not scored."
                ),
            )
        )

    if evaluated:
        assert batch is not None
        summary = batch.summary.strip() or (
            "The interview was evaluated per question; see the question breakdown "
            "for evidence."
        )
        strengths = _clean_list(batch.strengths)
        weaknesses = _clean_list(batch.weaknesses)
        recommendations = _clean_list(batch.recommendations)
        completion_status = (
            "partial" if counts.unanswered or counts.not_evaluable else "complete"
        )
    else:
        summary = (
            "No question had enough verified candidate evidence to evaluate. "
            "The report contains transcript quality notes instead of scores."
        )
        strengths = []
        weaknesses = ["No evaluable candidate evidence was available."]
        recommendations = [
            "Retake the interview with a working microphone and in a quieter "
            "environment so answers can be attributed and verified."
        ]
        completion_status = "insufficient_evidence"
        warnings.append(
            QualityWarning(
                code="insufficient_evidence",
                message="No question could be evaluated from verified evidence.",
            )
        )

    return ReportResponse(
        overall_score=overall_score,
        summary=summary,
        strengths=strengths,
        weaknesses=weaknesses,
        recommendations=recommendations,
        question_scores=question_scores,
        skill_scores=skill_scores,
        counts=counts,
        completion_status=completion_status,
        quality_warnings=warnings,
        prompt_version=REPORT_PROMPT_VERSION,
        rubric_version=RUBRIC_VERSION,
    )
