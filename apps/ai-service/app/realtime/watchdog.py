"""Keeps the interviewer's realtime model session alive for a whole interview.

vision-agents reconnects its Gemini Live socket for close codes 1011-1014 only.
Any other unclean close ends its processing loop for good, so the agent stays in
the call and never speaks again while the interview keeps running. Live sessions
do end early in practice: a live call on 2026-11-01 lost the session with API
error code 1008 about three minutes in, after which the agent ignored the
candidate. Re-establishing the session is safe for the plugin - it keeps a
session-resumption handle and resumes the conversation on connect().
"""

import asyncio
import logging
from typing import Protocol

logger = logging.getLogger(__name__)

RECONNECT_DELAYS_S: tuple[float, ...] = (2.0, 5.0, 10.0)


class RealtimeSession(Protocol):
    """The parts of a realtime LLM the watchdog needs."""

    connected: bool

    async def connect(self) -> None:
        """Establish (or re-establish) the provider session."""

    async def close(self) -> None:
        """Close the provider session."""


class SessionWatchdog:
    """Reconnects the realtime session whenever it drops before the call ends."""

    def __init__(
        self,
        llm: RealtimeSession,
        *,
        call_id: str,
        poll_interval_s: float = 1.0,
        delays: tuple[float, ...] = RECONNECT_DELAYS_S,
    ) -> None:
        """Track one agent's realtime session for the duration of a call."""
        self._llm = llm
        self._call_id = call_id
        self._poll_interval_s = poll_interval_s
        self._delays = delays
        self._stopped = False
        self.reconnects = 0
        self.gave_up = False

    def stop(self) -> None:
        """Stop watching; used when the call finishes."""
        self._stopped = True

    async def run(self) -> None:
        """Poll the session and reconnect it whenever it drops."""
        failures = 0

        while not self._stopped:
            if self._llm.connected:
                failures = 0
                self.gave_up = False
            elif failures >= len(self._delays):
                if not self.gave_up:
                    logger.error(
                        "realtime session unrecoverable",
                        extra={"call_id": self._call_id, "attempts": failures},
                    )
                    self.gave_up = True
            else:
                delay = self._delays[failures]
                failures += 1
                await asyncio.sleep(delay)
                if self._stopped:
                    return
                try:
                    await self._llm.connect()
                except Exception:
                    logger.warning(
                        "realtime session reconnect failed",
                        exc_info=True,
                        extra={"call_id": self._call_id, "attempt": failures},
                    )
                else:
                    if self._stopped:
                        # The call ended while the reconnect was in flight; a
                        # revived session would keep the provider socket open.
                        await self._close_while_stopped()
                        return
                    if self._llm.connected:
                        self.reconnects += 1
                        logger.info(
                            "realtime session reconnected",
                            extra={"call_id": self._call_id, "attempt": failures},
                        )
                continue

            await asyncio.sleep(self._poll_interval_s)

    async def _close_while_stopped(self) -> None:
        try:
            await self._llm.close()
        except Exception:
            logger.warning(
                "realtime session close failed",
                exc_info=True,
                extra={"call_id": self._call_id},
            )
