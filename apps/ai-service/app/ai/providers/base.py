"""Provider contracts shared by every chat adapter.

Business logic depends on this module only. Adapters translate between the
normalized request/response types here and a vendor API; no controller or
service should import a vendor SDK directly.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import ClassVar, Protocol, runtime_checkable

import httpx
from tenacity import RetryError


@dataclass(frozen=True, slots=True)
class TokenUsage:
    """Token counts reported by a provider. Missing values stay ``None``."""

    prompt_tokens: int | None = None
    completion_tokens: int | None = None

    @property
    def total_tokens(self) -> int | None:
        if self.prompt_tokens is None and self.completion_tokens is None:
            return None
        return (self.prompt_tokens or 0) + (self.completion_tokens or 0)


@dataclass(frozen=True, slots=True)
class ChatRequest:
    """Normalized request accepted by every chat provider."""

    prompt: str
    temperature: float | None = None
    max_tokens: int | None = None
    seed: int | None = None


@dataclass(frozen=True, slots=True)
class ChatResponse:
    """Normalized response returned by every chat provider."""

    text: str
    provider: str
    model: str
    usage: TokenUsage = field(default_factory=TokenUsage)
    latency_ms: float = 0.0


@dataclass(frozen=True, slots=True)
class ProviderCapabilities:
    """Optional features a provider supports.

    Routing uses this metadata for observability and future capability-aware
    selection. A provider that does not support an option may ignore it, which
    is why these flags default to the conservative values.
    """

    text_generation: bool = True
    temperature: bool = True
    max_tokens: bool = True
    seed: bool = False
    json_mode: bool = False
    streaming: bool = False


@dataclass(frozen=True, slots=True)
class ProviderDescription:
    """Identity, model and health of one configured provider."""

    name: str
    model: str
    capabilities: ProviderCapabilities
    configured: bool
    available: bool | None = None


@dataclass(frozen=True, slots=True)
class ProviderFailure:
    """One provider's failure, normalized so callers never parse vendor errors."""

    provider: str
    model: str
    code: str
    retryable: bool
    message: str


@dataclass(frozen=True, slots=True)
class ChatBatchResponse:
    """Normalized results from an all-provider fan-out.

    ``responses`` contains only successes, in configured provider order.
    ``text`` is the canonical answer used by single-response workflows;
    ``combined_text`` keeps every provider's answer for comparison.
    """

    responses: tuple[ChatResponse, ...]
    failures: tuple[ProviderFailure, ...] = ()
    mode: str = "all"

    @property
    def text(self) -> str:
        if not self.responses:
            raise LookupError("No provider returned a response")
        return self.responses[0].text

    @property
    def combined_text(self) -> str:
        return "\n\n".join(
            f"[{response.provider}:{response.model}]\n{response.text}"
            for response in self.responses
        )


class ProviderConfigurationError(ValueError):
    """A provider name or setting is invalid. Never retried."""


class ProviderResponseError(ValueError):
    """A provider completed the request but returned no usable answer.

    This is a permanent response problem, not an availability problem: retrying
    the same prompt usually yields the same empty result. Keep it out of the
    switchable set so routing and tenacity do not repeat the call.
    """

    retryable = False

    def __init__(self, message: str, *, provider: str, code: str = "invalid_response") -> None:
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.code = code


class AllProvidersFailedError(RuntimeError):
    """Every provider in an all-provider fan-out failed."""

    def __init__(self, failures: tuple[ProviderFailure, ...]) -> None:
        self.failures = failures
        detail = ", ".join(f"{failure.provider}={failure.code}" for failure in failures)
        super().__init__(f"All AI providers failed: {detail}")


class NoProviderAvailableError(RuntimeError):
    """No candidate provider was configured, healthy, or successful."""

    def __init__(self, failures: tuple[ProviderFailure, ...]) -> None:
        self.failures = failures
        detail = (
            ", ".join(f"{failure.provider}={failure.code}" for failure in failures)
            or "none configured"
        )
        super().__init__(f"No AI provider available: {detail}")


@runtime_checkable
class LLMProvider(Protocol):
    """Backward-compatible contract used by the interview endpoints."""

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str: ...


class BaseChatProvider(ABC):
    """Standard interface every chat adapter implements.

    Adapters only translate the normalized request into a vendor call and the
    vendor response into a normalized ``ChatResponse``. Retries, routing,
    health checks, fallback and logging live outside the adapter.
    """

    name: str = "unknown"
    capabilities: ClassVar[ProviderCapabilities] = ProviderCapabilities()

    @property
    @abstractmethod
    def model(self) -> str:
        """The model identifier this provider will call."""

    @abstractmethod
    async def complete(self, request: ChatRequest) -> ChatResponse:
        """Run one completion and normalize the result."""

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str:
        """Compatibility wrapper for callers that only need the text."""
        response = await self.complete(
            ChatRequest(
                prompt=prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                seed=seed,
            )
        )
        return response.text

    async def is_configured(self) -> bool:
        """Whether credentials/endpoint settings are present locally."""
        return True

    async def is_available(self) -> bool:
        """Whether this provider can serve requests right now.

        The default avoids network calls: adapters override this when a cheap
        reachability probe exists (Ollama). A configured-but-failing remote
        provider is handled by routing on the real request.
        """
        return await self.is_configured()

    async def describe(self) -> ProviderDescription:
        return ProviderDescription(
            name=self.name,
            model=self.model,
            capabilities=self.capabilities,
            configured=await self.is_configured(),
            available=await self.is_available(),
        )


_SWITCHABLE_STATUS = {
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "INTERNAL",
}
_SWITCHABLE_HTTP_CODES = {429, 500, 502, 503, 504}


def root_cause(error: BaseException) -> BaseException:
    """Unwrap tenacity's RetryError down to the provider exception."""
    if isinstance(error, RetryError) and error.last_attempt is not None:
        inner = error.last_attempt.exception()
        if inner is not None and inner is not error:
            return root_cause(inner)
    return error


def is_switchable_error(error: BaseException) -> bool:
    """Whether a failure is an availability problem another provider may fix.

    Quota, rate limits, 5xx, transport errors and timeouts are switchable.
    Programming errors and malformed model responses are never masked.
    """
    error = root_cause(error)

    if isinstance(error, ProviderResponseError):
        return False

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

    if isinstance(error, (TimeoutError, asyncio.TimeoutError, httpx.TimeoutException)):
        return True

    message = str(error).lower()
    return any(marker in message for marker in ("quota", "resource_exhausted", "unavailable"))


def _failure_code(error: BaseException) -> str:
    status = str(getattr(error, "status", "") or "").upper()
    if status:
        return status

    code = getattr(error, "code", None) or getattr(error, "status_code", None)
    if code is not None:
        return str(code)

    response = getattr(error, "response", None)
    response_code = getattr(response, "status_code", None)
    if response_code is not None:
        return str(response_code)

    if isinstance(error, (TimeoutError, asyncio.TimeoutError, httpx.TimeoutException)):
        return "timeout"
    if isinstance(error, ProviderConfigurationError):
        return "not_configured"
    if isinstance(error, ValueError):
        return "invalid_response"
    return "provider_error"


def normalize_failure(
    provider: object, error: BaseException, *, default_name: str | None = None
) -> ProviderFailure:
    """Turn any adapter exception into a stable, secret-free failure record."""
    cause = root_cause(error)
    name = getattr(provider, "name", None) or default_name or type(provider).__name__
    model = getattr(provider, "model", None) or "unknown"
    return ProviderFailure(
        provider=str(name),
        model=str(model),
        code=_failure_code(cause),
        retryable=is_switchable_error(cause),
        message=f"{type(cause).__name__}: {str(cause)[:200]}",
    )
