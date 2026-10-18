"""Tracks at most one realtime agent per interview call.

The agent runs as a background asyncio task so the HTTP request that starts it
returns immediately. The manager guarantees a single agent per call id, cleans
up finished tasks, and surfaces failures through structured logs.
"""

import asyncio
import logging

from app.realtime.runner import run_agent
from app.schemas.realtime import RealtimeJoinRequest

logger = logging.getLogger(__name__)


class RealtimeAgentManager:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    def active_calls(self) -> list[str]:
        return [call_id for call_id, task in self._tasks.items() if not task.done()]

    async def start(self, request: RealtimeJoinRequest) -> bool:
        """Start an agent for the call. Returns False if one is already running."""
        async with self._lock:
            existing = self._tasks.get(request.call_id)
            if existing is not None and not existing.done():
                return False

            task = asyncio.create_task(
                run_agent(request), name=f"realtime-agent:{request.call_id}"
            )
            self._tasks[request.call_id] = task
            task.add_done_callback(
                lambda finished, call_id=request.call_id: self._on_done(
                    call_id, finished
                )
            )
            return True

    async def stop(self, call_id: str) -> bool:
        """Cancel a running agent. Returns False if none was running."""
        async with self._lock:
            task = self._tasks.get(call_id)
            if task is None or task.done():
                return False
            task.cancel()
            return True

    def _on_done(self, call_id: str, task: asyncio.Task[None]) -> None:
        if self._tasks.get(call_id) is task:
            self._tasks.pop(call_id, None)

        if task.cancelled():
            logger.info("realtime agent cancelled", extra={"call_id": call_id})
            return

        error = task.exception()
        if error is not None:
            logger.error(
                "realtime agent failed",
                extra={"call_id": call_id},
                exc_info=error,
            )


realtime_agent_manager = RealtimeAgentManager()
