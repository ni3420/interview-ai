"""Live-model check for the report pipeline.

Skipped unless RUN_LIVE_LLM_TESTS=1 so the normal suite never calls Gemini or
Ollama. Run it explicitly against the configured local provider:

    RUN_LIVE_LLM_TESTS=1 uv run pytest tests/live -q
"""

import os

import pytest

from app.ai.providers.factory import get_llm_provider
from app.schemas.report import QAPairInput, ReportRequest
from app.services.report_pipeline import normalize_quote
from app.services.report_evaluation import build_report

pytestmark = [
    pytest.mark.skipif(
        os.environ.get("RUN_LIVE_LLM_TESTS") != "1",
        reason="Live LLM checks are opt-in: set RUN_LIVE_LLM_TESTS=1",
    ),
    pytest.mark.live,
]

ANSWER = (
    "A database index is a separate lookup structure that stores key values "
    "with pointers to rows, so the engine can find matching rows without "
    "scanning the whole table. The trade-off is extra storage and slower writes."
)


@pytest.mark.asyncio
async def test_live_model_returns_evidence_backed_scores():
    request = ReportRequest(
        interview_id="live-interview",
        job_description="Backend engineer with PostgreSQL experience.",
        resume_text="Backend engineer with five years of PostgreSQL experience.",
        qa_pairs=[
            QAPairInput(
                question_index=0,
                question="What is a database index and what does it cost you?",
                answer=ANSWER,
                reference_answer=(
                    "An index speeds reads by avoiding full scans but adds "
                    "storage and write overhead."
                ),
            )
        ],
    )

    report = await build_report(request, provider=get_llm_provider())

    assert report.score_scale == 10
    assert report.overall_score is not None
    assert 0 <= report.overall_score <= 10
    question = report.question_scores[0]
    assert question.score is not None
    assert question.expected_answer_source == "stored_reference"
    assert question.criteria
    for quote in question.evidence:
        assert normalize_quote(quote) in normalize_quote(ANSWER)
