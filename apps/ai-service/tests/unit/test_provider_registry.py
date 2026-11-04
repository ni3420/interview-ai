from __future__ import annotations

import pytest

from app.ai.providers.base import (
    BaseChatProvider,
    ChatRequest,
    ChatResponse,
    ProviderConfigurationError,
)
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.ollama import OllamaProvider
from app.ai.providers.registry import ProviderRegistry
from app.core.config import settings


class _StubProvider(BaseChatProvider):
    name = "stub"

    @property
    def model(self) -> str:
        return "stub-model"

    async def complete(self, request: ChatRequest) -> ChatResponse:
        return ChatResponse(
            text=request.prompt,
            provider=self.name,
            model=self.model,
        )


class _OtherStubProvider(_StubProvider):
    name = "other"


def test_registry_creates_one_instance_per_name():
    registry = ProviderRegistry()
    registry.register("stub", _StubProvider)

    first = registry.get("stub")
    second = registry.get("stub")

    assert first is second
    assert isinstance(first, _StubProvider)
    assert registry.names() == ("stub",)
    assert registry.has("STUB") is True


def test_registry_clear_drops_cached_instances():
    registry = ProviderRegistry()
    registry.register("stub", _StubProvider)
    first = registry.get("stub")

    registry.clear()

    assert registry.get("stub") is not first


def test_registry_rejects_unknown_and_duplicate_names():
    registry = ProviderRegistry()
    with pytest.raises(ProviderConfigurationError, match="Unsupported AI provider"):
        registry.get("missing")

    registry.register("stub", _StubProvider)
    with pytest.raises(ProviderConfigurationError, match="already registered"):
        registry.register("stub", _OtherStubProvider)

    with pytest.raises(ProviderConfigurationError, match="must not be empty"):
        registry.register("  ", _StubProvider)


def test_adapters_expose_identity_capabilities_and_model():
    gemini = GeminiProvider()
    ollama = OllamaProvider()

    assert gemini.name == "gemini"
    assert gemini.model == settings.gemini_model
    assert gemini.capabilities.seed is True
    assert gemini.capabilities.json_mode is True

    assert ollama.name == "ollama"
    assert ollama.model == settings.ollama_model
    assert ollama.capabilities.seed is True
    assert ollama.capabilities.streaming is False
