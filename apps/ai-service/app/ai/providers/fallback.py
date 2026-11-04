"""Primary/fallback LLM selection for specific-provider mode.

Gemini is the preferred provider, but its quota can be exhausted or it can
return transient 5xx errors. When that happens and the fallback is running
locally with the configured model, requests continue there instead of failing
the interview workflow.

Only availability-style failures switch providers (quota, 429, 5xx, timeouts).
Programming errors and malformed model responses are never masked.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.ai.providers.base import (
    ChatRequest,
    ChatResponse,
    LLMProvider,
    ProviderCapabilities,
    is_switchable_error,
    root_cause,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

__all__ = ["FallbackLLMProvider", "is_switchable_error"]

logger = logging.getLogger(__name__)


class FallbackLLMProvider:
    """Runs the primary provider, switching to a fallback when needed."""

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

    @property
    def name(self) -> str:
        return getattr(self._primary, "name", "primary")

    @property
    def model(self) -> str:
        return getattr(self._primary, "model", "unknown")

    @property
    def capabilities(self) -> ProviderCapabilities:
        return getattr(self._primary, "capabilities", ProviderCapabilities())

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str:
        response = await self.complete(
            ChatRequest(
                prompt=prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                seed=seed,
            )
        )
        return response.text

    async def complete(self, request: ChatRequest) -> ChatResponse:
        try:
            return await self._complete_with(self._primary, request)
        except Exception as error:
            cause = root_cause(error)
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
            return await self._complete_with(self._fallback, request)

    @classmethod
    async def _complete_with(
        cls, provider: LLMProvider, request: ChatRequest
    ) -> ChatResponse:
        complete = getattr(provider, "complete", None)
        if complete is not None:
            return await complete(request)

        # Some callers/tests provide a minimal generate()-only provider.
        text = await cls._invoke(
            provider,
            request.prompt,
            request.temperature,
            request.max_tokens,
            request.seed,
        )
        return ChatResponse(
            text=text,
            provider=str(getattr(provider, "name", "primary")),
            model=str(getattr(provider, "model", "unknown")),
        )

    @staticmethod
    async def _invoke(
        provider: LLMProvider,
        prompt: str,
        temperature: float | None,
        max_tokens: int | None,
        seed: int | None,
    ) -> str:
        options: dict[str, float | int] = {}
        if temperature is not None:
            options["temperature"] = temperature
        if max_tokens is not None:
            options["max_tokens"] = max_tokens
        if seed is not None:
            options["seed"] = seed

        # Older/deterministic callers pass no options; keep their provider
        # contract unchanged.
        if not options:
            return await provider.generate(prompt)
        return await provider.generate(prompt, **options)
