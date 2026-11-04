from __future__ import annotations

import asyncio
import itertools

import pytest

from app.ai.providers.base import (
    AllProvidersFailedError,
    ChatRequest,
    ChatResponse,
    NoProviderAvailableError,
    ProviderCapabilities,
    ProviderConfigurationError,
    normalize_failure,
)
from app.ai.providers.factory import (
    get_llm_provider,
    provider_config_problems,
    provider_log_fields,
    validate_provider_config,
)
from app.ai.providers.registry import registry
from app.ai.providers.routing import RoutingLLMProvider, provider_health
from app.core.config import settings

_counter = itertools.count()


class _QuotaError(Exception):
    status = "RESOURCE_EXHAUSTED"


class _FakeProvider:
    capabilities = ProviderCapabilities()

    def __init__(
        self,
        *,
        text: str = "ok",
        error: Exception | None = None,
        configured: bool = True,
        available: bool = True,
        delay: float = 0.0,
    ) -> None:
        self.name = f"fake-{next(_counter)}"
        self.model = f"{self.name}-model"
        self.text = text
        self.error = error
        self.configured = configured
        self.available = available
        self.delay = delay
        self.calls = 0

    async def is_configured(self) -> bool:
        return self.configured

    async def is_available(self) -> bool:
        return self.available

    async def complete(self, request: ChatRequest) -> ChatResponse:
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error is not None:
            raise self.error
        return ChatResponse(text=self.text, provider=self.name, model=self.model)


@pytest.fixture(autouse=True)
def _clear_health_cache():
    provider_health.invalidate()
    yield
    provider_health.invalidate()


def _register(provider: _FakeProvider) -> _FakeProvider:
    registry.register(provider.name, lambda: provider)
    return provider


def _select(monkeypatch, mode: str, primary: str, order: str) -> None:
    monkeypatch.setattr(settings, "ai_provider_mode", mode)
    monkeypatch.setattr(settings, "ai_provider", primary)
    monkeypatch.setattr(settings, "ai_provider_order", order)
    monkeypatch.setattr(settings, "ai_fallback_provider", "")
    monkeypatch.setattr(settings, "ai_provider_timeout_seconds", 0.0)


class TestAnyMode:
    @pytest.mark.asyncio
    async def test_skips_unconfigured_provider(self, monkeypatch):
        primary = _register(_FakeProvider(text="primary", configured=False))
        fallback = _register(_FakeProvider(text="fallback"))
        _select(
            monkeypatch,
            "any",
            primary.name,
            f"{primary.name},{fallback.name}",
        )

        provider = get_llm_provider()

        assert isinstance(provider, RoutingLLMProvider)
        assert await provider.generate("prompt") == "fallback"
        assert primary.calls == 0
        assert fallback.calls == 1

    @pytest.mark.asyncio
    async def test_skips_unhealthy_provider(self, monkeypatch):
        primary = _register(_FakeProvider(text="primary", available=False))
        fallback = _register(_FakeProvider(text="fallback"))
        _select(
            monkeypatch,
            "any",
            primary.name,
            f"{primary.name},{fallback.name}",
        )

        assert await get_llm_provider().generate("prompt") == "fallback"
        assert primary.calls == 0

    @pytest.mark.asyncio
    async def test_moves_on_after_switchable_error(self, monkeypatch):
        primary = _register(_FakeProvider(error=_QuotaError("quota")))
        fallback = _register(_FakeProvider(text="fallback"))
        _select(
            monkeypatch,
            "any",
            primary.name,
            f"{primary.name},{fallback.name}",
        )

        assert await get_llm_provider().generate("prompt") == "fallback"
        assert primary.calls == 1
        assert fallback.calls == 1

    @pytest.mark.asyncio
    async def test_does_not_mask_non_switchable_error(self, monkeypatch):
        primary = _register(_FakeProvider(error=ValueError("bad prompt")))
        fallback = _register(_FakeProvider(text="fallback"))
        _select(
            monkeypatch,
            "any",
            primary.name,
            f"{primary.name},{fallback.name}",
        )

        with pytest.raises(ValueError, match="bad prompt"):
            await get_llm_provider().generate("prompt")
        assert fallback.calls == 0

    @pytest.mark.asyncio
    async def test_raises_when_no_provider_is_eligible(self, monkeypatch):
        primary = _register(_FakeProvider(configured=False))
        _select(monkeypatch, "any", primary.name, primary.name)

        with pytest.raises(NoProviderAvailableError) as excinfo:
            await get_llm_provider().generate("prompt")

        assert excinfo.value.failures[0].code == "unavailable"

    @pytest.mark.asyncio
    async def test_times_out_one_provider(self, monkeypatch):
        slow = _register(_FakeProvider(delay=0.05))
        _select(monkeypatch, "any", slow.name, slow.name)
        monkeypatch.setattr(settings, "ai_provider_timeout_seconds", 0.01)

        with pytest.raises(NoProviderAvailableError) as excinfo:
            await get_llm_provider().generate("prompt")

        assert excinfo.value.failures[0].code == "timeout"
        assert excinfo.value.failures[0].retryable is True


class TestAllMode:
    @pytest.mark.asyncio
    async def test_returns_every_success_and_normalized_failure(self, monkeypatch):
        first = _register(_FakeProvider(text="first"))
        failing = _register(_FakeProvider(error=_QuotaError("quota")))
        unconfigured = _register(_FakeProvider(configured=False))
        _select(
            monkeypatch,
            "all",
            first.name,
            f"{first.name},{failing.name},{unconfigured.name}",
        )

        provider = get_llm_provider()
        assert isinstance(provider, RoutingLLMProvider)
        batch = await provider.complete_all(ChatRequest("prompt"))

        assert [response.text for response in batch.responses] == ["first"]
        assert {failure.provider for failure in batch.failures} == {
            failing.name,
            unconfigured.name,
        }
        assert batch.text == "first"
        assert batch.combined_text == f"[{first.name}:{first.model}]\nfirst"
        assert first.calls == 1
        assert failing.calls == 1
        assert unconfigured.calls == 0

    @pytest.mark.asyncio
    async def test_generate_returns_canonical_response(self, monkeypatch):
        first = _register(_FakeProvider(text="first"))
        second = _register(_FakeProvider(text="second"))
        _select(
            monkeypatch,
            "all",
            first.name,
            f"{first.name},{second.name}",
        )

        assert await get_llm_provider().generate("prompt") == "first"
        assert first.calls == 1
        assert second.calls == 1

    @pytest.mark.asyncio
    async def test_raises_when_every_provider_fails(self, monkeypatch):
        first = _register(_FakeProvider(error=_QuotaError("quota")))
        second = _register(_FakeProvider(error=ValueError("bad output")))
        _select(
            monkeypatch,
            "all",
            first.name,
            f"{first.name},{second.name}",
        )

        with pytest.raises(AllProvidersFailedError) as excinfo:
            await get_llm_provider().complete_all(ChatRequest("prompt"))

        assert len(excinfo.value.failures) == 2


class TestSelectionConfig:
    def test_unknown_candidate_name_is_rejected(self, monkeypatch):
        _select(monkeypatch, "any", "ollama", "ollama,missing-provider")

        with pytest.raises(ProviderConfigurationError, match="Unsupported AI provider"):
            get_llm_provider()

    def test_config_problems_report_unknown_names(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider_mode", "any")
        monkeypatch.setattr(settings, "ai_provider", "missing-provider")
        monkeypatch.setattr(settings, "ai_fallback_provider", "")
        monkeypatch.setattr(settings, "ai_provider_order", "missing-order-name")

        problems = provider_config_problems()

        assert any("missing-provider" in problem for problem in problems)
        assert any("missing-order-name" in problem for problem in problems)

    def test_validate_accepts_registered_providers(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider_mode", "any")
        monkeypatch.setattr(settings, "ai_provider", "ollama")
        monkeypatch.setattr(settings, "ai_fallback_provider", "")
        monkeypatch.setattr(settings, "ai_provider_order", "ollama")

        validate_provider_config()

    def test_log_fields_are_provider_agnostic(self, monkeypatch):
        primary = _register(_FakeProvider())
        second = _register(_FakeProvider())
        _select(
            monkeypatch,
            "any",
            primary.name,
            f"{primary.name},{second.name}",
        )

        fields = provider_log_fields()

        assert fields["configuredProvider"] == "any"
        assert primary.model in fields["configuredModel"]
        assert second.model in fields["configuredModel"]

    def test_log_fields_in_specific_mode_name_the_adapter(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider_mode", "specific")
        monkeypatch.setattr(settings, "ai_provider", "ollama")
        monkeypatch.setattr(settings, "ai_fallback_provider", "")

        fields = provider_log_fields()

        assert fields["configuredProvider"] == "ollama"
        assert fields["configuredModel"] == settings.ollama_model


class TestFailureNormalization:
    def test_quota_error_is_retryable(self):
        failure = normalize_failure(_FakeProvider(), _QuotaError("quota"))

        assert failure.code == "RESOURCE_EXHAUSTED"
        assert failure.retryable is True

    def test_invalid_response_is_not_retryable(self):
        failure = normalize_failure(_FakeProvider(), ValueError("Empty response"))

        assert failure.code == "invalid_response"
        assert failure.retryable is False

    def test_timeout_is_retryable(self):
        failure = normalize_failure(_FakeProvider(), TimeoutError("slow"))

        assert failure.code == "timeout"
        assert failure.retryable is True
