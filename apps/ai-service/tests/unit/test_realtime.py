import asyncio
import sys
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app
from app.realtime.instructions import build_instructions
from app.realtime.manager import RealtimeAgentManager
from app.realtime.runner import (
    RealtimeRuntimeUnavailableError,
    _load_runtime,
    ensure_available,
    run_agent,
)
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


class TestRealtimeRunnerConfiguration:
    """The live interviewer must fail fast with an actionable error."""

    def test_requires_stream_credentials(self, monkeypatch):
        monkeypatch.setattr(settings, "stream_api_key", "")
        monkeypatch.setattr(settings, "stream_api_secret", "")
        monkeypatch.setattr(settings, "gemini_api_key", "")

        with pytest.raises(RealtimeRuntimeUnavailableError, match="STREAM_API_KEY"):
            ensure_available()

    def test_requires_gemini_api_key(self, monkeypatch):
        monkeypatch.setattr(settings, "stream_api_key", "stream-key")
        monkeypatch.setattr(settings, "stream_api_secret", "stream-secret")
        monkeypatch.setattr(settings, "gemini_api_key", "")

        with pytest.raises(RealtimeRuntimeUnavailableError, match="GEMINI_API_KEY"):
            ensure_available()

    def test_reports_missing_realtime_dependencies(self, monkeypatch):
        # `None` in sys.modules makes any import of the package fail, regardless
        # of whether the realtime extra is installed in the test environment.
        monkeypatch.setitem(sys.modules, "vision_agents", None)

        with pytest.raises(
            RealtimeRuntimeUnavailableError, match="dependencies are not installed"
        ):
            _load_runtime()


class FakeUser:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeRealtimeLLM:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeGemini:
    Realtime = FakeRealtimeLLM


class FakeGetstream:
    class Edge:  # mirrors the real plugin's Edge class
        pass


class FakeJoin:
    async def __aenter__(self):
        return None

    async def __aexit__(self, *_exc):
        return False


class FakeAgent:
    """Minimal stand-in for vision_agents.core.Agent."""

    last: "FakeAgent | None" = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.responses: list[str] = []
        self.finished = False
        self.calls: list[tuple[str, str]] = []
        FakeAgent.last = self

    async def create_call(self, call_type: str, call_id: str):
        self.calls.append((call_type, call_id))
        return {"call_type": call_type, "call_id": call_id}

    def join(self, _call):
        return FakeJoin()

    async def simple_response(self, text: str) -> None:
        self.responses.append(text)

    async def finish(self) -> None:
        self.finished = True


class TestRealtimeRunner:
    @pytest.mark.asyncio
    async def test_uses_gemini_live_and_waits_for_the_call(self, monkeypatch):
        monkeypatch.setattr(settings, "stream_api_key", "stream-key")
        monkeypatch.setattr(settings, "stream_api_secret", "stream-secret")
        monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
        monkeypatch.setattr(settings, "realtime_model", "gemini-live-test")

        with patch(
            "app.realtime.runner._load_runtime",
            return_value=(FakeAgent, FakeUser, FakeGemini, FakeGetstream),
        ):
            await run_agent(SAMPLE)

        agent = FakeAgent.last
        assert agent is not None

        # The live interviewer must use the Gemini Live provider, never the
        # Ollama text provider (which has no realtime implementation).
        llm = agent.kwargs["llm"]
        assert isinstance(llm, FakeRealtimeLLM)
        assert llm.kwargs["model"] == "gemini-live-test"
        assert llm.kwargs["api_key"] == "gemini-key"

        # Grounded instructions and a single greeting are passed to the agent.
        assert "Senior Frontend Engineer" in agent.kwargs["instructions"]
        assert agent.calls == [("default", "interview-abc")]
        assert agent.responses
        # finish() blocks until the call ends; it must be awaited in the session.
        assert agent.finished is True


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
