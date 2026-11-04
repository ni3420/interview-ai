"""Provider selection, health checks and normalized fan-out.

``specific`` mode keeps the existing primary/fallback wrapper. This module
owns the two newer modes:

* ``any``   - pick the first configured, healthy provider, moving to the next
              eligible provider only on availability-style failures.
* ``all``   - call every configured provider concurrently and normalize the
              successes and failures into one batch.

Timeouts and health probes are bounded here so a single provider cannot pin a
request for the whole workflow budget.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import TYPE_CHECKING

from app.ai.providers.base import (
    AllProvidersFailedError,
    ChatBatchResponse,
    ChatRequest,
    ChatResponse,
    LLMProvider,
    NoProviderAvailableError,
    ProviderCapabilities,
    ProviderConfigurationError,
    ProviderFailure,
    normalize_failure,
)
from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)


def _provider_name(provider: object) -> str:
    name = getattr(provider, "name", None)
    if name:
        return str(name)
    return type(provider).__name__


class ProviderHealth:
    """Small TTL cache around adapter availability probes.

    Health checks are advisory: an ``any`` request skips a provider reported
    unavailable and still tries the remaining ones. A probe failure never
    becomes the request's error.
    """

    def __init__(self) -> None:
        self._configured: dict[str, tuple[float, bool]] = {}
        self._available: dict[str, tuple[float, bool]] = {}

    def invalidate(self, name: str | None = None) -> None:
        if name is None:
            self._configured.clear()
            self._available.clear()
            return
        self._configured.pop(name, None)
        self._available.pop(name, None)

    @staticmethod
    def _key(provider: object) -> str:
        return _provider_name(provider)

    async def is_configured(self, provider: object) -> bool:
        key = self._key(provider)
        now = time.monotonic()
        cached = self._configured.get(key)
        if cached is not None and now < cached[0]:
            return cached[1]

        check = getattr(provider, "is_configured", None)
        if check is None:
            value = True
        else:
            try:
                result = check()
                value = bool(await result) if inspect.isawaitable(result) else bool(result)
            except Exception:
                value = False

        self._configured[key] = (now + 300.0, value)
        return value

    async def is_available(self, provider: object) -> bool:
        key = self._key(provider)
        now = time.monotonic()
        cached = self._available.get(key)
        if cached is not None and now < cached[0]:
            return cached[1]

        value = False
        if await self.is_configured(provider):
            check = getattr(provider, "is_available", None)
            if check is None:
                value = True
            else:
                try:
                    timeout = max(settings.ai_health_check_timeout_seconds, 0.1)
                    value = bool(await asyncio.wait_for(check(), timeout=timeout))
                except Exception:
                    value = False

        self._available[key] = (
            now + max(settings.ai_health_check_ttl_seconds, 0.0),
            value,
        )
        return value


provider_health = ProviderHealth()


class RoutingLLMProvider:
    """Implements ``any`` and ``all`` provider selection modes."""

    def __init__(
        self, providers: Sequence[LLMProvider], *, mode: str
    ) -> None:
        normalized_mode = mode.strip().lower()
        if normalized_mode not in {"any", "all"}:
            raise ProviderConfigurationError(
                f"Unsupported provider selection mode: {mode}"
            )
        if not providers:
            raise ProviderConfigurationError(
                "No AI providers configured for selection mode "
                f"{normalized_mode!r}"
            )

        self.mode = normalized_mode
        self._providers: list[LLMProvider] = []
        seen: set[str] = set()
        for provider in providers:
            name = _provider_name(provider)
            if name in seen:
                continue
            seen.add(name)
            self._providers.append(provider)

    @property
    def name(self) -> str:
        return self.mode

    @property
    def model(self) -> str:
        return ",".join(
            f"{_provider_name(provider)}:{getattr(provider, 'model', 'unknown')}"
            for provider in self._providers
        )

    @property
    def capabilities(self) -> ProviderCapabilities:
        return getattr(
            self._providers[0], "capabilities", ProviderCapabilities()
        )

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
        if self.mode == "all":
            return (await self.complete_all(request)).responses[0]
        return await self._complete_any(request)

    async def complete_all(self, request: ChatRequest) -> ChatBatchResponse:
        """Call every configured provider concurrently and normalize results."""
        configured = await asyncio.gather(
            *(provider_health.is_configured(provider) for provider in self._providers)
        )

        responses: list[ChatResponse] = []
        failures: list[ProviderFailure] = []
        jobs: list[tuple[LLMProvider, asyncio.Future[ChatResponse]]] = []
        for provider, is_configured in zip(
            self._providers, configured, strict=True
        ):
            if not is_configured:
                failures.append(
                    ProviderFailure(
                        provider=_provider_name(provider),
                        model=str(getattr(provider, "model", "unknown")),
                        code="not_configured",
                        retryable=False,
                        message="Provider credentials or endpoint are not configured",
                    )
                )
                continue
            jobs.append((provider, asyncio.ensure_future(self._complete_one(provider, request))))

        results = await asyncio.gather(
            *(job for _, job in jobs), return_exceptions=True
        )
        for (provider, _), result in zip(jobs, results, strict=True):
            if isinstance(result, BaseException):
                failure = normalize_failure(provider, result)
                failures.append(failure)
                logger.warning(
                    "Provider %s failed in all-provider mode (%s)",
                    failure.provider,
                    failure.code,
                )
            else:
                responses.append(result)

        if not responses:
            raise AllProvidersFailedError(tuple(failures))

        return ChatBatchResponse(
            responses=tuple(responses),
            failures=tuple(failures),
            mode="all",
        )

    async def _complete_any(self, request: ChatRequest) -> ChatResponse:
        failures: list[ProviderFailure] = []

        for provider in self._providers:
            name = _provider_name(provider)
            if not await provider_health.is_available(provider):
                failures.append(
                    ProviderFailure(
                        provider=name,
                        model=str(getattr(provider, "model", "unknown")),
                        code="unavailable",
                        retryable=True,
                        message="Provider did not pass its health check",
                    )
                )
                logger.info("Skipping unavailable AI provider %s", name)
                continue

            try:
                return await self._complete_one(provider, request)
            except Exception as error:
                failure = normalize_failure(provider, error)
                failures.append(failure)
                if not failure.retryable:
                    # Never mask invalid requests or malformed model output.
                    raise
                logger.warning(
                    "Provider %s failed (%s); trying the next eligible provider",
                    name,
                    failure.code,
                )

        raise NoProviderAvailableError(tuple(failures))

    async def _complete_one(
        self, provider: LLMProvider, request: ChatRequest
    ) -> ChatResponse:
        complete = getattr(provider, "complete", None)
        if complete is None:
            text = await provider.generate(
                request.prompt,
                **_request_options(request),
            )
            return ChatResponse(
                text=text,
                provider=_provider_name(provider),
                model=str(getattr(provider, "model", "unknown")),
            )

        timeout = settings.ai_provider_timeout_seconds
        if timeout and timeout > 0:
            result = await asyncio.wait_for(complete(request), timeout=timeout)
        else:
            result = await complete(request)

        if isinstance(result, ChatResponse):
            return ChatResponse(
                text=result.text,
                provider=result.provider or _provider_name(provider),
                model=result.model or str(getattr(provider, "model", "unknown")),
                usage=result.usage,
                latency_ms=result.latency_ms,
            )
        if isinstance(result, str):
            return ChatResponse(
                text=result,
                provider=_provider_name(provider),
                model=str(getattr(provider, "model", "unknown")),
            )
        raise ProviderConfigurationError(
            f"Provider {_provider_name(provider)} returned an unsupported response"
        )

    async def is_available(self) -> bool:
        results = await asyncio.gather(
            *(provider_health.is_available(provider) for provider in self._providers)
        )
        return any(results)


def _request_options(request: ChatRequest) -> dict[str, float | int]:
    options: dict[str, float | int] = {}
    if request.temperature is not None:
        options["temperature"] = request.temperature
    if request.max_tokens is not None:
        options["max_tokens"] = request.max_tokens
    if request.seed is not None:
        options["seed"] = request.seed
    return options
