"""Primary/fallback LLM selection.

Gemini is the preferred provider, but its quota can be exhausted or it can
return transient 5xx errors. When that happens and Ollama is running locally
with the configured model, requests continue on Ollama instead of failing the
interview workflow.

Only availability-style failures switch providers (quota, 429, 5xx, timeouts).
Programming errors and malformed model responses are never masked.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

import httpx
from tenacity import RetryError

from app.ai.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_SWITCHABLE_STATUS = {
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "INTERNAL",
}
_SWITCHABLE_HTTP_CODES = {429, 500, 502, 503, 504}


def _root_cause(error: BaseException) -> BaseException:
    """Unwrap tenacity's RetryError down to the provider exception."""
    if isinstance(error, RetryError) and error.last_attempt is not None:
        inner = error.last_attempt.exception()
        if inner is not None and inner is not error:
            return _root_cause(inner)
    return error


def is_switchable_error(error: BaseException) -> bool:
    """Whether the primary provider failed for an availability reason."""
    # Providers use tenacity, which raises RetryError instead of the final
    # provider exception. Inspect the wrapped cause so a quota/5xx still
    # triggers the fallback.
    error = _root_cause(error)

    status = str(getattr(error, "status", "") or "").upper()
    if status in _SWITCHABLE_STATUS:
        return True

    code = getattr(error, "code", None) or getattr(error, "status_code", None)
    if code in _SWITCHABLE_HTTP_CODES:
        return True

    response = getattr(error, "response", None)
    if getattr(response, "status_code", None) in _SWITCHABLE_HTTP_CODES:
        return True

    if isinstance(error, httpx.TransportError):
        return True

    message = str(error).lower()
    return any(
        marker in message for marker in ("quota", "resource_exhausted", "unavailable")
    )


class FallbackLLMProvider:
    """Runs the primary provider, switching to a local fallback when needed."""

    def __init__(
        self,
        primary: LLMProvider,
        fallback: LLMProvider,
        fallback_available: Callable[[], Awaitable[bool]],
        fallback_name: str,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._fallback_available = fallback_available
        self._fallback_name = fallback_name

    async def generate(self, prompt: str) -> str:
        try:
            return await self._primary.generate(prompt)
        except Exception as error:
            cause = _root_cause(error)
            if not is_switchable_error(cause):
                raise

            if not await self._fallback_available():
                raise

            logger.warning(
                "Primary LLM unavailable (%s, status=%s); switching to %s",
                type(cause).__name__,
                getattr(cause, "status", "") or "unknown",
                self._fallback_name,
            )
            return await self._fallback.generate(prompt)
