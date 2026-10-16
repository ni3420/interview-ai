import pytest
from httpx import AsyncClient, ASGITransport
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch
from app.main import app
from app.schemas.interview import (
    InterviewPlanResponse,
    NextQuestionResponse,
    EvaluationResponse,
    QuestionScore,
)

TEST_API_KEY = "dev-secret-key"
HEADERS = {"X-API-Key": TEST_API_KEY, "Content-Type": "application/json"}


@contextmanager
def patch_llm():
    """Replace the configured LLM provider with a deterministic AsyncMock.

    The endpoints resolve their provider through ``get_llm_provider`` so tests
    never depend on a live Gemini or Ollama instance.
    """
    provider = AsyncMock()
    with patch("app.api.v1.interviews.get_llm_provider", return_value=provider):
        yield provider.generate

SAMPLE_RESUME = "Software engineer with 5 years experience in React, Node.js, TypeScript. Built scalable web applications. Led team of 4 developers."
SAMPLE_JD = "Senior Frontend Engineer role. Requirements: React, TypeScript, Next.js, GraphQL, 5+ years experience. Responsible for building user-facing features."


class TestInterviewPlanEndpoint:
    @pytest.mark.asyncio
    async def test_generate_plan_success(self):
        mock_response = {
            "questions": [
                "Describe a complex React project you've built.",
                "How do you handle state management in large applications?",
                "Explain your experience with TypeScript generics.",
            ],
            "focus_areas": ["React", "TypeScript", "State Management"],
        }

        with patch_llm() as mock_generate:
            mock_generate.return_value = '{"questions": ["Describe a complex React project you\'ve built.", "How do you handle state management in large applications?", "Explain your experience with TypeScript generics."], "focus_areas": ["React", "TypeScript", "State Management"]}'

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/plan",
                    headers=HEADERS,
                    json={"resume_text": SAMPLE_RESUME, "job_description": SAMPLE_JD},
                )

        assert response.status_code == 200
        data = response.json()
        assert "questions" in data
        assert len(data["questions"]) >= 1
        assert "focus_areas" in data
        assert isinstance(data["focus_areas"], list)

    @pytest.mark.asyncio
    async def test_generate_plan_unauthorized(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/v1/interviews/plan",
                headers={"Content-Type": "application/json"},
                json={"resume_text": SAMPLE_RESUME, "job_description": SAMPLE_JD},
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_generate_plan_invalid_input(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/v1/interviews/plan",
                headers=HEADERS,
                json={"resume_text": "short", "job_description": "short"},
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_generate_plan_gemini_failure(self):
        with patch_llm() as mock_generate:
            mock_generate.side_effect = Exception("Gemini API error")

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/plan",
                    headers=HEADERS,
                    json={"resume_text": SAMPLE_RESUME, "job_description": SAMPLE_JD},
                )

        assert response.status_code == 500


class TestNextQuestionEndpoint:
    @pytest.mark.asyncio
    async def test_next_question_follow_up(self):
        mock_response = {
            "question": "Can you elaborate on the specific React hooks you used?",
            "is_follow_up": True,
            "follow_up_count": 1,
        }

        with patch_llm() as mock_generate:
            mock_generate.return_value = '{"question": "Can you elaborate on the specific React hooks you used?", "is_follow_up": true, "follow_up_count": 1}'

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/next-question",
                    headers=HEADERS,
                    json={
                        "resume_text": SAMPLE_RESUME,
                        "job_description": SAMPLE_JD,
                        "current_question": "Describe a complex React project you've built.",
                        "user_answer": "I built a dashboard using React.",
                        "question_index": 0,
                        "previous_qa": [],
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["is_follow_up"] is True
        assert data["follow_up_count"] == 1
        assert len(data["question"]) > 0

    @pytest.mark.asyncio
    async def test_next_question_move_on(self):
        mock_response = {
            "question": "How do you handle state management in large applications?",
            "is_follow_up": False,
            "follow_up_count": 0,
        }

        with patch_llm() as mock_generate:
            mock_generate.return_value = '{"question": "How do you handle state management in large applications?", "is_follow_up": false, "follow_up_count": 0}'

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/next-question",
                    headers=HEADERS,
                    json={
                        "resume_text": SAMPLE_RESUME,
                        "job_description": SAMPLE_JD,
                        "current_question": "Describe a complex React project you've built.",
                        "user_answer": "I built a comprehensive dashboard using React with Redux for state management, TypeScript for type safety, and implemented real-time updates with WebSockets. The project included user authentication, data visualization, and role-based access control.",
                        "question_index": 0,
                        "previous_qa": [],
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["is_follow_up"] is False
        assert data["follow_up_count"] == 0

    @pytest.mark.asyncio
    async def test_next_question_max_follow_ups(self):
        with patch_llm() as mock_generate:
            mock_generate.return_value = '{"question": "Next topic question", "is_follow_up": false, "follow_up_count": 0}'

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/next-question",
                    headers=HEADERS,
                    json={
                        "resume_text": SAMPLE_RESUME,
                        "job_description": SAMPLE_JD,
                        "current_question": "Previous question",
                        "user_answer": "Answer",
                        "question_index": 0,
                        "previous_qa": [],
                    },
                )

        assert response.status_code == 200


class TestEvaluationEndpoint:
    @pytest.mark.asyncio
    async def test_evaluate_interview_success(self):
        mock_response = {
            "overall_score": 85,
            "strengths": ["Strong technical knowledge", "Clear communication", "Good problem-solving"],
            "weaknesses": ["Could improve on system design", "Limited experience with GraphQL"],
            "recommendations": ["Study system design patterns", "Build a GraphQL project"],
            "question_scores": [
                {"question_index": 0, "score": 90, "feedback": "Excellent depth and specificity"},
                {"question_index": 1, "score": 80, "feedback": "Good understanding, minor gaps"},
                {"question_index": 2, "score": 85, "feedback": "Strong practical experience shown"},
            ],
        }

        with patch_llm() as mock_generate:
            mock_generate.return_value = str(mock_response).replace("'", '"')

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/evaluate",
                    headers=HEADERS,
                    json={
                        "resume_text": SAMPLE_RESUME,
                        "job_description": SAMPLE_JD,
                        "qa_pairs": [
                            {"question": "Q1", "answer": "A1"},
                            {"question": "Q2", "answer": "A2"},
                        ],
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert 0 <= data["overall_score"] <= 100
        assert len(data["strengths"]) >= 1
        assert len(data["weaknesses"]) >= 1
        assert len(data["recommendations"]) >= 1
        assert len(data["question_scores"]) >= 1
        for qs in data["question_scores"]:
            assert "question_index" in qs
            assert 0 <= qs["score"] <= 100
            assert "feedback" in qs

    @pytest.mark.asyncio
    async def test_evaluate_interview_unauthorized(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/v1/interviews/evaluate",
                headers={"Content-Type": "application/json"},
                json={
                    "resume_text": SAMPLE_RESUME,
                    "job_description": SAMPLE_JD,
                    "qa_pairs": [{"question": "Q1", "answer": "A1"}],
                },
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_evaluate_interview_empty_qa_pairs(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/v1/interviews/evaluate",
                headers=HEADERS,
                json={
                    "resume_text": SAMPLE_RESUME,
                    "job_description": SAMPLE_JD,
                    "qa_pairs": [],
                },
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_evaluate_interview_gemini_failure(self):
        with patch_llm() as mock_generate:
            mock_generate.side_effect = Exception("Gemini API error")

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/v1/interviews/evaluate",
                    headers=HEADERS,
                    json={
                        "resume_text": SAMPLE_RESUME,
                        "job_description": SAMPLE_JD,
                        "qa_pairs": [{"question": "Q1", "answer": "A1"}],
                    },
                )

        assert response.status_code == 500


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_check(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "Interview AI Service"


class TestSchemaValidation:
    def test_interview_plan_response_schema(self):
        response = InterviewPlanResponse(
            questions=["Q1", "Q2"],
            focus_areas=["Area1"],
        )
        assert len(response.questions) == 2

    def test_next_question_response_schema(self):
        response = NextQuestionResponse(
            question="Test question",
            is_follow_up=True,
            follow_up_count=1,
        )
        assert response.is_follow_up is True
        assert response.follow_up_count == 1

    def test_evaluation_response_schema(self):
        response = EvaluationResponse(
            overall_score=85,
            strengths=["Strength1"],
            weaknesses=["Weakness1"],
            recommendations=["Rec1"],
            question_scores=[QuestionScore(question_index=0, score=90, feedback="Good")],
        )
        assert response.overall_score == 85
        assert len(response.question_scores) == 1