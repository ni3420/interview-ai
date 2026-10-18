import asyncio
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.realtime.instructions import build_instructions
from app.realtime.manager import RealtimeAgentManager
from app.realtime.runner import RealtimeRuntimeUnavailableError
from app.schemas.realtime import RealtimeJoinRequest, RealtimeJoinResponse

TEST_API_KEY = "dev-secret-key"
HEADERS = {"X-API-Key": TEST_API_KEY, "Content-Type": "application/json"}

SAMPLE = RealtimeJoinRequest(
    call_id="interview-abc",
    call_type="default",
    interview_id="abc",
    resume_text="Jane Doe. 6 years React and TypeScript. Led a team building a design system.",
    job_description="Senior Frontend Engineer. React, TypeScript, design systems.",
    questions=["Tell me about yourself.", "Describe a complex React project."],
)


class TestBuildInstructions:
    def test_includes_grounded_context(self):
        instructions = build_instructions(SAMPLE)
        assert "Senior Frontend Engineer" in instructions
        assert "Tell me about yourself." in instructions
        assert "design system" in instructions

    def test_treats_resume_as_untrusted(self):
        instructions = build_instructions(SAMPLE)
        assert "untrusted reference data" in instructions

    def test_caps_number_of_questions(self):
        request = SAMPLE.model_copy(
            update={"questions": [f"Question {i}" for i in range(100)]}
        )
        instructions = build_instructions(request)
        assert "Question 24" in instructions
        assert "Question 25" not in instructions

    def test_handles_missing_context(self):
        request = RealtimeJoinRequest(call_id="c")
        instructions = build_instructions(request)
        assert "AI interviewer" in instructions
        assert "Resume:" not in instructions

    def test_neutralises_at_mentions(self):
        # The vision agent parses any "@word" as a "@file.md" reference and
        # crashes on missing files, so emails/handles must be sanitised.
        request = RealtimeJoinRequest(
            call_id="c",
            resume_text="Reach me at jane.doe@gmail.com or @jane.",
            job_description="Ping @recruiter for details.",
            questions=["What is your @handle?"],
        )
        instructions = build_instructions(request)
        assert "@" not in instructions
        assert "(at)gmail.com" in instructions


@contextmanager
def patch_manager(started: bool = True):
    manager = AsyncMock()
    manager.start.return_value = started
    with patch("app.api.v1.realtime.realtime_agent_manager", manager):
        yield manager


class TestJoinCallEndpoint:
    @pytest.mark.asyncio
    async def test_requires_api_key(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/v1/realtime/join-call",
                headers={"Content-Type": "application/json"},
                json={"call_id": "interview-abc"},
            )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_503_when_unavailable(self):
        with patch(
            "app.api.v1.realtime.ensure_available",
            side_effect=RealtimeRuntimeUnavailableError("no credentials"),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/v1/realtime/join-call",
                    headers=HEADERS,
                    json={"call_id": "interview-abc"},
                )
        assert response.status_code == 503

    @pytest.mark.asyncio
    async def test_starts_agent(self):
        with patch("app.api.v1.realtime.ensure_available"), patch_manager(
            started=True
        ) as manager:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/v1/realtime/join-call", headers=HEADERS, json=SAMPLE.model_dump()
                )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "started"
        assert body["already_running"] is False
        assert body["call_id"] == "interview-abc"
        manager.start.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_reports_already_running(self):
        with patch("app.api.v1.realtime.ensure_available"), patch_manager(
            started=False
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/v1/realtime/join-call", headers=HEADERS, json=SAMPLE.model_dump()
                )

        body = response.json()
        assert body["status"] == "already_running"
        assert body["already_running"] is True


class TestRealtimeAgentManager:
    @pytest.mark.asyncio
    async def test_deduplicates_per_call(self):
        release = asyncio.Event()

        async def fake_run(_request):
            await release.wait()

        manager = RealtimeAgentManager()
        with patch("app.realtime.manager.run_agent", fake_run):
            first = await manager.start(SAMPLE)
            second = await manager.start(SAMPLE)

            assert first is True
            assert second is False
            assert manager.active_calls() == ["interview-abc"]

            release.set()
            await asyncio.sleep(0)
            for task in list(manager._tasks.values()):
                await task

        assert manager.active_calls() == []

    @pytest.mark.asyncio
    async def test_stop_returns_false_when_idle(self):
        manager = RealtimeAgentManager()
        assert await manager.stop("nope") is False


class TestSchemaValidation:
    def test_rejects_empty_call_id(self):
        with pytest.raises(ValueError, match="at least 1 character"):
            RealtimeJoinRequest(call_id="")

    def test_response_defaults(self):
        response = RealtimeJoinResponse(
            status="started", call_id="c", agent_user_id="ai-interviewer"
        )
        assert response.already_running is False
