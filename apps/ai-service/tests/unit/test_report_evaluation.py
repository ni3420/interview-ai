import json
from collections.abc import Iterable

import pytest

from app.core.rubric import DEFAULT_RUBRIC
from app.schemas.report import QAPairInput, ReportRequest
from app.services.report_evaluation import ReportEvaluationError, build_report


ANSWERS = {
    0: "Indexes reduce table scans and speed up lookups.",
    1: "I would add a composite index for the query pattern.",
}


class ScriptedProvider:
    """Deterministic provider that returns scripted responses in order."""

    def __init__(self, responses: Iterable[str | Exception]):
        self.responses = list(responses)
        self.calls: list[dict] = []

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str:
        self.calls.append(
            {
                "prompt": prompt,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "seed": seed,
            }
        )
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def legacy_request(
    *,
    answers: dict[int, str] | None = None,
    use_reference: bool = True,
) -> ReportRequest:
    values = answers or ANSWERS
    return ReportRequest(
        interview_id="interview-1",
        job_description="Backend engineer",
        resume_text="Test resume",
        qa_pairs=[
            QAPairInput(
                question_index=index,
                question=f"Question {index}?",
                answer=answer,
                reference_answer=(
                    f"Reference answer {index}." if use_reference else None
                ),
            )
            for index, answer in values.items()
        ],
    )


def valid_batch(
    scores: dict[int, list[float]],
    *,
    statuses: dict[int, str] | None = None,
    answers: dict[int, str] | None = None,
) -> str:
    values = answers or ANSWERS
    statuses = statuses or {}
    return json.dumps(
        {
            "questions": [
                {
                    "question_index": index,
                    "status": statuses.get(index, "answered"),
                    "criteria": [
                        {
                            "id": criterion.id,
                            "score": score,
                            "evidence": [values[index]],
                            "comment": "",
                        }
                        for criterion, score in zip(DEFAULT_RUBRIC, question_scores)
                    ],
                    "strengths": ["Clear explanation"],
                    "missing_points": ["Could add an example"],
                    "feedback": "Solid answer.",
                }
                for index, question_scores in scores.items()
            ],
            "summary": "The candidate explained the core concepts.",
            "strengths": ["Clear structure"],
            "weaknesses": ["Missing edge cases"],
            "recommendations": ["Practise edge cases"],
        }
    )


@pytest.mark.asyncio
async def test_code_computes_weighted_question_and_overall_scores():
    provider = ScriptedProvider(
        [
            valid_batch(
                {
                    0: [10, 8, 6, 4, 2, 0],
                    1: [10, 10, 10, 10, 10, 10],
                }
            )
        ]
    )

    report = await build_report(legacy_request(), provider)

    first, second = report.question_scores
    assert first.score == 6.3
    assert second.score == 10.0
    assert report.overall_score == 8.15
    assert [criterion.weight for criterion in first.criteria] == [
        30,
        20,
        15,
        15,
        10,
        10,
    ]
    assert first.expected_answer_source == "stored_reference"
    assert first.criteria[0].label == "Technical correctness"
    assert report.skill_scores is not None
    assert report.skill_scores.technical_knowledge == 10.0
    assert report.skill_scores.problem_solving == 6.0
    assert report.skill_scores.communication == 5.0
    assert report.skill_scores.conceptual_understanding == 8.0
    assert report.skill_scores.relevance == 9.0
    assert report.counts.answered == 2
    assert report.counts.evaluated == 2
    assert report.completion_status == "complete"
    assert report.prompt_version == "report-v3"
    assert report.rubric_version == "rubric-v1"
    assert report.score_scale == 10
    assert len(provider.calls) == 1
    assert provider.calls[0]["temperature"] == 0.0
    assert provider.calls[0]["max_tokens"] == 4096
    assert provider.calls[0]["seed"] == 42


@pytest.mark.asyncio
async def test_retries_once_after_malformed_json():
    provider = ScriptedProvider(
        ["this is not json", valid_batch({0: [10] * 6, 1: [10] * 6})]
    )

    report = await build_report(legacy_request(), provider)

    assert report.overall_score == 10.0
    assert len(provider.calls) == 2


@pytest.mark.asyncio
async def test_accepts_rubric_ids_in_any_order_and_with_aliases():
    payload = json.loads(valid_batch({0: [10, 8, 6, 4, 2, 0], 1: [10] * 6}))
    criteria = payload["questions"][0]["criteria"]
    criteria.reverse()
    for criterion in criteria:
        if criterion["id"] == "technical_correctness":
            criterion["id"] = "Technical Knowledge"
        elif criterion["id"] == "problem_solving":
            criterion["id"] = "Problem-Solving"
        elif criterion["id"] == "communication":
            criterion["id"] = "Communication Clarity"
    provider = ScriptedProvider([json.dumps(payload)])

    report = await build_report(legacy_request(), provider)

    assert report.question_scores[0].score == 6.3
    assert [criterion.id for criterion in report.question_scores[0].criteria] == [
        criterion.id for criterion in DEFAULT_RUBRIC
    ]
    assert len(provider.calls) == 1


@pytest.mark.asyncio
async def test_normalizes_model_status_variants():
    payload = json.loads(valid_batch({0: [10] * 6, 1: [10] * 6}))
    payload["questions"][0]["status"] = "rejected"
    payload["questions"][1]["status"] = "Incomplete"
    provider = ScriptedProvider([json.dumps(payload)])

    report = await build_report(legacy_request(), provider)

    assert [question.status for question in report.question_scores] == [
        "partial",
        "partial",
    ]
    assert len(provider.calls) == 1


@pytest.mark.asyncio
async def test_retry_prompt_names_the_required_rubric_ids():
    payload = json.loads(valid_batch({0: [10] * 6, 1: [10] * 6}))
    payload["questions"][0]["criteria"].pop()
    provider = ScriptedProvider(
        [json.dumps(payload), valid_batch({0: [10] * 6, 1: [10] * 6})]
    )

    report = await build_report(legacy_request(), provider)

    assert report.overall_score == 10.0
    assert len(provider.calls) == 2
    retry_prompt = provider.calls[1]["prompt"]
    assert "previous response was rejected" in retry_prompt
    for criterion in DEFAULT_RUBRIC:
        assert criterion.id in retry_prompt


@pytest.mark.asyncio
async def test_retries_after_invalid_evidence_then_fails_cleanly():
    payload = json.loads(valid_batch({0: [10] * 6, 1: [10] * 6}))
    payload["questions"][0]["criteria"][0]["evidence"] = ["a quote that is not real"]
    provider = ScriptedProvider([json.dumps(payload), json.dumps(payload)])

    with pytest.raises(ReportEvaluationError) as error:
        await build_report(legacy_request(), provider)

    assert error.value.code == "invalid_model_output"
    assert len(provider.calls) == 2


@pytest.mark.asyncio
async def test_rejects_a_batch_that_is_missing_a_rubric_criterion():
    payload = json.loads(valid_batch({0: [10] * 6, 1: [10] * 6}))
    payload["questions"][0]["criteria"].pop()
    provider = ScriptedProvider([json.dumps(payload), json.dumps(payload)])

    with pytest.raises(ReportEvaluationError) as error:
        await build_report(legacy_request(), provider)

    assert error.value.code == "invalid_model_output"


@pytest.mark.asyncio
async def test_rejects_a_batch_that_omits_an_evaluated_question():
    payload = json.loads(valid_batch({0: [10] * 6, 1: [10] * 6}))
    payload["questions"].pop()
    provider = ScriptedProvider([json.dumps(payload), json.dumps(payload)])

    with pytest.raises(ReportEvaluationError):
        await build_report(legacy_request(), provider)


@pytest.mark.asyncio
async def test_model_can_refine_an_answer_to_partial():
    provider = ScriptedProvider(
        [valid_batch({0: [10] * 6, 1: [10] * 6}, statuses={0: "partial"})]
    )

    report = await build_report(legacy_request(), provider)

    assert report.question_scores[0].status == "partial"
    assert report.counts.partial == 1
    assert report.counts.answered == 1
    assert report.counts.evaluated == 2
    # A partial answer is still evaluated evidence, so the evaluation itself
    # is complete; the per-question status carries the incompleteness.
    assert report.completion_status == "complete"


@pytest.mark.asyncio
async def test_unanswered_questions_get_null_scores_not_zero():
    provider = ScriptedProvider([])

    report = await build_report(
        legacy_request(answers={0: "", 1: "um"}), provider
    )

    assert provider.calls == []
    assert report.overall_score is None
    assert report.skill_scores is None
    assert all(question.score is None for question in report.question_scores)
    assert report.counts.not_evaluable == 0
    assert report.counts.unanswered == 2
    assert report.counts.evaluated == 0
    assert report.completion_status == "insufficient_evidence"
    codes = {warning.code for warning in report.quality_warnings}
    assert "insufficient_evidence" in codes
    assert "partial_evaluation" in codes


@pytest.mark.asyncio
async def test_generated_expected_answers_are_separately_labelled():
    expected = json.dumps(
        {
            "answers": [
                {"question_index": 0, "expected_answer": "A reference answer."}
            ]
        }
    )
    provider = ScriptedProvider(
        [expected, valid_batch({0: [10] * 6}, answers={0: ANSWERS[0]})]
    )

    report = await build_report(
        legacy_request(answers={0: ANSWERS[0]}, use_reference=False), provider
    )

    question = report.question_scores[0]
    assert question.expected_answer == "A reference answer."
    assert question.expected_answer_source == "ai_generated"
    assert len(provider.calls) == 2


@pytest.mark.asyncio
async def test_expected_answer_failure_is_not_fatal():
    provider = ScriptedProvider(
        ["not json", valid_batch({0: [10] * 6}, answers={0: ANSWERS[0]})]
    )

    report = await build_report(
        legacy_request(answers={0: ANSWERS[0]}, use_reference=False), provider
    )

    question = report.question_scores[0]
    assert question.expected_answer is None
    assert question.expected_answer_source == "unavailable"
    assert question.score == 10.0


@pytest.mark.asyncio
async def test_empty_model_output_never_becomes_a_report():
    provider = ScriptedProvider(["", ""])

    with pytest.raises(ReportEvaluationError):
        await build_report(legacy_request(), provider)


@pytest.mark.asyncio
async def test_evidence_matching_ignores_extra_whitespace():
    answer = "Indexes   reduce table scans and speed up lookups."
    provider = ScriptedProvider(
        [valid_batch({0: [10] * 6, 1: [10] * 6}, answers={0: answer, 1: ANSWERS[1]})]
    )

    report = await build_report(
        legacy_request(answers={0: answer, 1: ANSWERS[1]}), provider
    )

    assert report.question_scores[0].score == 10.0


@pytest.mark.asyncio
async def test_same_fixture_is_byte_identical_across_five_runs():
    payload = valid_batch({0: [10, 8, 6, 4, 2, 0], 1: [10] * 6})

    results = []
    for _ in range(5):
        provider = ScriptedProvider([payload])
        report = await build_report(legacy_request(), provider)
        results.append(report.model_dump())

    assert all(result == results[0] for result in results)
