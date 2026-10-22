import httpx
import pytest

from app.ai.providers import factory
from app.ai.providers.fallback import FallbackLLMProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.ollama import OllamaProvider
from app.core.config import settings


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, *_args, **_kwargs):
        self.calls: list[dict] = []

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    async def post(self, url: str, json: dict) -> _FakeResponse:
        self.calls.append({"url": url, "json": json})
        return _FakeResponse({"response": "  hello from ollama  "})


class TestProviderFactory:
    def test_gemini_primary_uses_ollama_fallback(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "gemini")
        monkeypatch.setattr(settings, "ai_fallback_provider", "ollama")
        assert isinstance(factory.get_llm_provider(), FallbackLLMProvider)

    def test_ollama_primary_needs_no_fallback(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "ollama")
        monkeypatch.setattr(settings, "ai_fallback_provider", "ollama")
        assert isinstance(factory.get_llm_provider(), OllamaProvider)

    def test_fallback_can_be_disabled(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "gemini")
        monkeypatch.setattr(settings, "ai_fallback_provider", "")
        assert isinstance(factory.get_llm_provider(), GeminiProvider)

    def test_rejects_unknown_provider(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "nope")
        monkeypatch.setattr(settings, "ai_fallback_provider", "ollama")
        with pytest.raises(ValueError, match="Unsupported AI provider"):
            factory.get_llm_provider()

    def test_rejects_unknown_fallback(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "gemini")
        monkeypatch.setattr(settings, "ai_fallback_provider", "nope")
        with pytest.raises(ValueError, match="Unsupported AI provider"):
            factory.get_llm_provider()


class TestOllamaProvider:
    @pytest.mark.asyncio
    async def test_generate_returns_trimmed_text(self, monkeypatch):
        fake = _FakeAsyncClient()
        monkeypatch.setattr(
            "app.ai.providers.ollama.httpx.AsyncClient", lambda **_kwargs: fake
        )

        result = await OllamaProvider().generate("prompt")

        assert result == "hello from ollama"
        assert fake.calls[0]["url"] == "/api/generate"
        assert fake.calls[0]["json"]["prompt"] == "prompt"
        assert fake.calls[0]["json"]["stream"] is False
        # Output is bounded so slow local CPU inference still completes.
        assert fake.calls[0]["json"]["options"]["num_predict"] == settings.ollama_max_tokens


class _TagsAsyncClient:
    def __init__(self, models: list[str], error: Exception | None = None):
        self._models = models
        self._error = error

    async def __aenter__(self) -> "_TagsAsyncClient":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    async def get(self, _url: str) -> _FakeResponse:
        if self._error is not None:
            raise self._error
        return _FakeResponse({"models": [{"name": name} for name in self._models]})


class TestOllamaAvailability:
    @pytest.mark.asyncio
    async def test_available_when_configured_model_is_installed(self, monkeypatch):
        monkeypatch.setattr(settings, "ollama_model", "llama3.2:1b")
        fake = _TagsAsyncClient(["llama3.2:1b", "nomic-embed-text:latest"])
        monkeypatch.setattr(
            "app.ai.providers.ollama.httpx.AsyncClient", lambda **_kwargs: fake
        )

        assert await OllamaProvider().is_available() is True

    @pytest.mark.asyncio
    async def test_accepts_latest_tag(self, monkeypatch):
        monkeypatch.setattr(settings, "ollama_model", "llama3.2")
        fake = _TagsAsyncClient(["llama3.2:latest"])
        monkeypatch.setattr(
            "app.ai.providers.ollama.httpx.AsyncClient", lambda **_kwargs: fake
        )

        assert await OllamaProvider().is_available() is True

    @pytest.mark.asyncio
    async def test_unavailable_when_model_is_missing(self, monkeypatch):
        monkeypatch.setattr(settings, "ollama_model", "llama3.2:1b")
        fake = _TagsAsyncClient(["some-other:model"])
        monkeypatch.setattr(
            "app.ai.providers.ollama.httpx.AsyncClient", lambda **_kwargs: fake
        )

        assert await OllamaProvider().is_available() is False

    @pytest.mark.asyncio
    async def test_unavailable_when_ollama_is_unreachable(self, monkeypatch):
        fake = _TagsAsyncClient([], error=httpx.ConnectError("connection refused"))
        monkeypatch.setattr(
            "app.ai.providers.ollama.httpx.AsyncClient", lambda **_kwargs: fake
        )

        assert await OllamaProvider().is_available() is False
