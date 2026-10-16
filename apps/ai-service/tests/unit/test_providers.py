import pytest

from app.ai.providers import factory
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
    def __init__(self, *args, **kwargs):
        self.calls: list[dict] = []

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    async def post(self, url: str, json: dict) -> _FakeResponse:
        self.calls.append({"url": url, "json": json})
        return _FakeResponse({"response": "  hello from ollama  "})


class TestProviderFactory:
    def test_defaults_to_gemini(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "gemini")
        assert isinstance(factory.get_llm_provider(), GeminiProvider)

    def test_selects_ollama(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "ollama")
        assert isinstance(factory.get_llm_provider(), OllamaProvider)

    def test_rejects_unknown_provider(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "nope")
        with pytest.raises(ValueError):
            factory.get_llm_provider()


class TestOllamaProvider:
    @pytest.mark.asyncio
    async def test_generate_returns_trimmed_text(self, monkeypatch):
        fake = _FakeAsyncClient()
        monkeypatch.setattr(
            "app.ai.providers.ollama.httpx.AsyncClient", lambda **kwargs: fake
        )

        result = await OllamaProvider().generate("prompt")

        assert result == "hello from ollama"
        assert fake.calls[0]["url"] == "/api/generate"
        assert fake.calls[0]["json"]["prompt"] == "prompt"
        assert fake.calls[0]["json"]["stream"] is False
        # Output is bounded so slow local CPU inference still completes.
        assert fake.calls[0]["json"]["options"]["num_predict"] == settings.ollama_max_tokens
