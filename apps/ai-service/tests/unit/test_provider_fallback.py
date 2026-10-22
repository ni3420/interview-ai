from concurrent.futures import Future

import httpx
import pytest
from tenacity import RetryError

from app.ai.providers.fallback import FallbackLLMProvider, is_switchable_error


class _FakeProvider:
    def __init__(self, result: str = "ok", error: Exception | None = None):
        self.result = result
        self.error = error
        self.calls = 0

    async def generate(self, _prompt: str) -> str:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.result


class _QuotaError(Exception):
    status = "RESOURCE_EXHAUSTED"


class _UnavailableError(Exception):
    status = "UNAVAILABLE"


class _InvalidRequestError(Exception):
    status = "INVALID_ARGUMENT"


def _retry_error(inner: BaseException) -> RetryError:
    future: Future[None] = Future()
    future.set_exception(inner)
    return RetryError(future)


def _wrapper(
    primary: _FakeProvider,
    fallback: _FakeProvider | None = None,
    ollama_available: bool = True,
) -> tuple[FallbackLLMProvider, _FakeProvider]:
    fallback = fallback or _FakeProvider("fallback")

    async def _available() -> bool:
        return ollama_available

    return (
        FallbackLLMProvider(primary, fallback, _available, "ollama"),
        fallback,
    )


@pytest.mark.asyncio
async def test_primary_success_never_calls_the_fallback():
    provider, fallback = _wrapper(_FakeProvider("primary"))

    assert await provider.generate("prompt") == "primary"
    assert fallback.calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error",
    [
        _QuotaError("quota exhausted"),
        _UnavailableError("service unavailable"),
        httpx.ConnectError("connection refused"),
    ],
)
async def test_switches_to_ollama_on_availability_errors(error):
    provider, fallback = _wrapper(_FakeProvider(error=error))

    assert await provider.generate("prompt") == "fallback"
    assert fallback.calls == 1


@pytest.mark.asyncio
async def test_does_not_switch_when_ollama_is_unavailable():
    error = _QuotaError("quota exhausted")
    provider, fallback = _wrapper(
        _FakeProvider(error=error), ollama_available=False
    )

    with pytest.raises(_QuotaError):
        await provider.generate("prompt")
    assert fallback.calls == 0


@pytest.mark.asyncio
async def test_does_not_mask_programming_errors():
    provider, fallback = _wrapper(_FakeProvider(error=ValueError("bad prompt")))

    with pytest.raises(ValueError, match="bad prompt"):
        await provider.generate("prompt")
    assert fallback.calls == 0


@pytest.mark.asyncio
async def test_does_not_switch_on_invalid_requests():
    error = _InvalidRequestError("invalid argument")
    provider, fallback = _wrapper(_FakeProvider(error=error))

    with pytest.raises(_InvalidRequestError):
        await provider.generate("prompt")
    assert fallback.calls == 0


def test_http_429_is_switchable():
    request = httpx.Request("POST", "https://example.test")
    response = httpx.Response(429, request=request)
    error = httpx.HTTPStatusError("quota", request=request, response=response)

    assert is_switchable_error(error) is True


def test_malformed_response_error_is_not_switchable():
    assert is_switchable_error(ValueError("Empty response from Gemini")) is False


def test_tenacity_retry_error_is_unwrapped():
    assert is_switchable_error(_retry_error(_QuotaError("quota"))) is True
    assert is_switchable_error(_retry_error(ValueError("bad response"))) is False


@pytest.mark.asyncio
async def test_switches_when_retries_end_in_a_quota_error():
    provider, fallback = _wrapper(
        _FakeProvider(error=_retry_error(_QuotaError("quota")))
    )

    assert await provider.generate("prompt") == "fallback"
    assert fallback.calls == 1
