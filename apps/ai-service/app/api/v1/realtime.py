import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_api_key
from app.core.config import settings
from app.realtime.manager import realtime_agent_manager
from app.realtime.runner import RealtimeRuntimeUnavailableError, ensure_available
from app.schemas.realtime import (
    RealtimeAgentStatusResponse,
    RealtimeJoinRequest,
    RealtimeJoinResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/join-call",
    response_model=RealtimeJoinResponse,
    dependencies=[Depends(verify_api_key)],
)
async def join_call(request: RealtimeJoinRequest) -> RealtimeJoinResponse:
    """Place the AI interviewer in an interview's Stream call.

    Idempotent per call: repeated requests while an agent is active return
    ``already_running`` instead of starting a second agent.
    """
    try:
        ensure_available()
    except RealtimeRuntimeUnavailableError as exc:
        logger.warning("Realtime agent unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    started = await realtime_agent_manager.start(request)
    return RealtimeJoinResponse(
        status="started" if started else "already_running",
        call_id=request.call_id,
        agent_user_id=settings.realtime_agent_user_id,
        already_running=not started,
    )


@router.get(
    "/status",
    response_model=RealtimeAgentStatusResponse,
    dependencies=[Depends(verify_api_key)],
)
async def status() -> RealtimeAgentStatusResponse:
    return RealtimeAgentStatusResponse(
        active_calls=realtime_agent_manager.active_calls()
    )


@router.post(
    "/leave",
    dependencies=[Depends(verify_api_key)],
)
async def leave(call_id: str) -> dict[str, object]:
    stopped = await realtime_agent_manager.stop(call_id)
    return {"status": "stopped" if stopped else "not_running", "call_id": call_id}
