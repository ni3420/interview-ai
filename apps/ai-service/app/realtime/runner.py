"""Runs the realtime vision agent for a single interview call.

Optional vision-agents imports are loaded lazily so the service can start even
when the realtime dependencies are not installed.

The live interviewer is a speech-to-speech agent. Vision Agents only ships a
realtime (audio in / audio out) provider for Gemini Live among the providers
this project installs, so the agent must use ``gemini.Realtime``. The LLM used
for resume plans and reports is configured separately via ``AI_PROVIDER``.
"""

import logging
from typing import Any

from app.core.config import settings
from app.realtime.instructions import build_instructions
from app.schemas.realtime import RealtimeJoinRequest

logger = logging.getLogger(__name__)


class RealtimeRuntimeUnavailableError(RuntimeError):
    """The realtime agent cannot run (missing credentials or dependencies)."""


def _missing_configuration() -> list[str]:
    """Return the names of required settings that are not configured."""
    missing: list[str] = []
    if not settings.stream_api_key:
        missing.append("STREAM_API_KEY")
    if not settings.stream_api_secret:
        missing.append("STREAM_API_SECRET")
    if not settings.gemini_api_key:
        missing.append("GEMINI_API_KEY")
    return missing


def ensure_available() -> None:
    """Fail fast when the agent cannot start.

    Called synchronously by the HTTP endpoint so a misconfigured deployment
    returns a clear 503 instead of accepting the request and failing later in
    a background task.
    """
    missing = _missing_configuration()
    if missing:
        raise RealtimeRuntimeUnavailableError(
            "Realtime agent is missing required configuration: "
            + ", ".join(missing)
        )
    _load_runtime()


def _load_runtime() -> tuple[Any, Any, Any, Any]:
    try:
        from vision_agents.core import Agent, User
        from vision_agents.plugins import gemini, getstream
    except ModuleNotFoundError as exc:
        raise RealtimeRuntimeUnavailableError(
            "Realtime agent dependencies are not installed. "
            "Install the 'realtime' extra "
            "(vision-agents[getstream,gemini]) in the AI service image."
        ) from exc

    return Agent, User, gemini, getstream


async def run_agent(request: RealtimeJoinRequest) -> None:
    """Join the call as the AI interviewer and run until it ends."""
    ensure_available()
    Agent, User, gemini, getstream = _load_runtime()

    instructions = build_instructions(request)

    agent_user = User(
        id=settings.realtime_agent_user_id,
        name=settings.realtime_agent_user_name,
    )

    agent = Agent(
        edge=getstream.Edge(),
        llm=gemini.Realtime(
            model=settings.realtime_model,
            api_key=settings.gemini_api_key,
        ),
        agent_user=agent_user,
        instructions=instructions,
    )

    call = await agent.create_call(request.call_type, request.call_id)

    logger.info(
        "AI interviewer joining interview call",
        extra={
            "call_id": request.call_id,
            "call_type": request.call_type,
        },
    )

    async with agent.join(call):
        await agent.simple_response(
            text="Greet the candidate and ask the first interview question."
        )
        # finish() waits for the call to end; it does not hang up immediately.
        await agent.finish()

    logger.info(
        "AI interviewer left interview call",
        extra={"call_id": request.call_id},
    )
