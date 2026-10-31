import json
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.rubric import DEFAULT_RUBRIC
from app.main import app

TEST_API_KEY = "dev-secret-key"
HEADERS = {"X-API-Key": TEST_API_KEY, "Content-Type": "application/json"}
ANSWER = "Indexes reduce table scans and speed up lookups."


@contextmanager
def patch_provider():
    provider = AsyncMock()
    with patch(
        "app.api.v1.interviews.get_llm_provider", return_value=provider
    ):
        yield provider


def valid_payload() -> str:
    return json.dumps(
        {
            "questions": [
                {
                    "question_index": 0,
                    "status": "answered",
                    "criteria": [
                        {
                            "id": criterion.id,
                            "score": 10,
                            "evidence": [ANSWER],
                            "comment": "",
                        }
                        for criterion in DEFAULT_RUBRIC
                    ],
                    "strengths": ["Accurate"],
                    "missing_points": [],
                    "feedback": "Good answer.",
                }
            ],
            "summary": "The candidate answered accurately.",
            "strengths": ["Accurate"],
            "weaknesses": ["Could add examples"],
            "recommendations": ["Practise examples"],
        }
    )


def request_body():
    return {
        "interview_id": "interview-1",
        "job_description": "Backend engineer",
        "resume_text": "Test resume",
        "qa_pairs": [
            {
                "question_index": 0,
                "question": "How do indexes help?",
                "answer": ANSWER,
                "reference_answer": "Indexes reduce table scans.",
            }
        ],
    }


class TestReportEndpoint:
    @pytest.mark.asyncio
    async def test_returns_code_scored_report(self):
        with patch_provider() as provider:
            provider.generate.return_value = valid_payload()

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/v1/interviews/report", headers=HEADERS, json=request_body()
                )

        assert response.status_code == 200
        data = response.json()
        assert data["score_scale"] == 10
        assert data["overall_score"] == 10.0
        assert data["question_scores"][0]["score"] == 10.0
        assert data["question_scores"][0]["expected_answer_source"] == "stored_reference"
        assert data["prompt_version"] == "report-v3"
        assert data["rubric_version"] == "rubric-v1"
        assert data["completion_status"] == "complete"
        assert len(provider.generate.await_args_list) == 1

    @pytest.mark.asyncio
    async def test_requires_service_api_key(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/v1/interviews/report",
                headers={"Content-Type": "application/json"},
                json=request_body(),
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_model_output_returns_502_and_no_report(self):
        with patch_provider() as provider:
            provider.generate.return_value = "not json"

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/v1/interviews/report", headers=HEADERS, json=request_body()
                )

        assert response.status_code == 502
        assert response.json()["detail"]["code"] == "invalid_model_output"
        assert len(provider.generate.await_args_list) == 2

    @pytest.mark.asyncio
    async def test_empty_interview_returns_insufficient_evidence(self):
        body = {
            "interview_id": "interview-1",
            "job_description": "Backend engineer",
            "qa_pairs": [],
            "segments": [],
        }

        with patch_provider() as provider:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/v1/interviews/report", headers=HEADERS, json=body
                )

        assert response.status_code == 200
        data = response.json()
        assert data["overall_score"] is None
        assert data["completion_status"] == "insufficient_evidence"
        assert data["question_scores"] == []
        assert provider.generate.await_args_list == []

    @pytest.mark.asyncio
    async def test_rejects_invalid_question_index(self):
        body = request_body()
        body["qa_pairs"][0]["question_index"] = -1

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/v1/interviews/report", headers=HEADERS, json=body
            )

        assert response.status_code == 422
