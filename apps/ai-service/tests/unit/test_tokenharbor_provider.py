from __future__ import annotations

import httpx
import pytest

from app.ai.providers import factory
from app.ai.providers.base import (
    ChatRequest,
    ChatResponse,
    ProviderCapabilities,
    ProviderConfigurationError,
    ProviderResponseError,
)
from app.ai.providers.openai_compatible import TokenHarborProvider
from app.ai.providers.registry import registry
from app.ai.providers.routing import provider_health
from app.core import metrics
from app.core.config import settings

API_URL = "https://tokenharbor.ai/v1/chat/completions"


class _FakeResponse:
    is_success = True
    status_code = 200

    def __init__(self, payload: dict | None = None):
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, response: _FakeResponse | httpx.Response):
        self._response = response
        self.calls: list[dict] = []

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    async def post(self, url: str, *, headers: dict, json: dict) -> _FakeResponse | httpx.Response:
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self._response


@pytest.fixture(autouse=True)
def _fresh_provider_state():
    registry.clear()
    provider_health.invalidate()
    yield
    registry.clear()
    provider_health.invalidate()


def _client(monkeypatch, response: _FakeResponse | httpx.Response) -> _FakeAsyncClient:
    fake = _FakeAsyncClient(response)
    monkeypatch.setattr(
        "app.ai.providers.openai_compatible.httpx.AsyncClient",
        lambda **_kwargs: fake,
    )
    return fake


def _configure(monkeypatch, *, key: str = "test-key") -> None:
    monkeypatch.setattr(settings, "tokenharbor_api_key", key)
    monkeypatch.setattr(settings, "tokenharbor_base_url", "https://tokenharbor.ai/v1")
    monkeypatch.setattr(settings, "tokenharbor_model", "deepseek-v4.1-flash:free")


class TestTokenHarborComplete:
    @pytest.mark.asyncio
    async def test_posts_openai_compatible_payload(self, monkeypatch):
        _configure(monkeypatch)
        fake = _client(
            monkeypatch,
            _FakeResponse(
                {
                    "choices": [{"message": {"content": "  the sky is blue  "}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 4},
                }
            ),
        )

        provider = TokenHarborProvider()
        response = await provider.complete(_chat_request(prompt="Why is the sky blue?", seed=7))

        assert fake.calls[0]["url"] == API_URL
        assert fake.calls[0]["headers"]["Authorization"] == "Bearer test-key"
        payload = fake.calls[0]["json"]
        assert payload == {
            "model": "deepseek-v4.1-flash:free",
            "messages": [{"role": "user", "content": "Why is the sky blue?"}],
            "temperature": settings.tokenharbor_temperature,
            "max_tokens": settings.tokenharbor_max_tokens,
            "stream": False,
        }
        # Seed support varies upstream, so it is never forwarded.
        assert "seed" not in payload
        assert response.text == "the sky is blue"
        assert response.provider == "tokenharbor"
        assert response.model == "deepseek-v4.1-flash:free"
        assert response.usage.prompt_tokens == 10
        assert response.usage.completion_tokens == 4

    @pytest.mark.asyncio
    async def test_request_options_override_defaults(self, monkeypatch):
        _configure(monkeypatch)
        fake = _client(
            monkeypatch,
            _FakeResponse({"choices": [{"message": {"content": "ok"}}]}),
        )

        await TokenHarborProvider().complete(
            _chat_request(prompt="p", temperature=0.0, max_tokens=64)
        )

        assert fake.calls[0]["json"]["temperature"] == 0.0
        assert fake.calls[0]["json"]["max_tokens"] == 64

    @pytest.mark.asyncio
    async def test_logs_token_usage(self, monkeypatch):
        _configure(monkeypatch)
        events: list[dict] = []
        monkeypatch.setattr(metrics, "log_event", lambda _message, **fields: events.append(fields))
        _client(
            monkeypatch,
            _FakeResponse(
                {
                    "choices": [{"message": {"content": "ok"}}],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 7},
                }
            ),
        )

        with metrics.usage_context("plan", interview_id="interview-1"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert events == [
            {
                "operation": "plan",
                "interviewId": "interview-1",
                "provider": "tokenharbor",
                "model": "deepseek-v4.1-flash:free",
                "promptTokens": 12,
                "completionTokens": 7,
                "totalTokens": 19,
                "estimatedCostUsd": None,
            }
        ]

    @pytest.mark.asyncio
    async def test_price_settings_produce_a_cost_estimate(self, monkeypatch):
        _configure(monkeypatch)
        monkeypatch.setattr(settings, "tokenharbor_input_price_per_1m", 1.0)
        monkeypatch.setattr(settings, "tokenharbor_output_price_per_1m", 2.0)
        events: list[dict] = []
        monkeypatch.setattr(metrics, "log_event", lambda _message, **fields: events.append(fields))
        _client(
            monkeypatch,
            _FakeResponse(
                {
                    "choices": [{"message": {"content": "ok"}}],
                    "usage": {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000},
                }
            ),
        )

        await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert events[-1]["estimatedCostUsd"] == 3.0

    @pytest.mark.asyncio
    async def test_accepts_content_parts(self, monkeypatch):
        _configure(monkeypatch)
        _client(
            monkeypatch,
            _FakeResponse(
                {
                    "choices": [
                        {
                            "message": {
                                "content": [
                                    {"type": "text", "text": "hello "},
                                    {"type": "image_url", "image_url": {"url": "x"}},
                                    {"type": "output_text", "text": "world"},
                                ]
                            }
                        }
                    ]
                }
            ),
        )

        response = await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert response.text == "hello world"

    @pytest.mark.asyncio
    async def test_accepts_legacy_choice_text(self, monkeypatch):
        _configure(monkeypatch)
        _client(
            monkeypatch,
            _FakeResponse({"choices": [{"text": "  legacy answer  "}]}),
        )

        response = await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert response.text == "legacy answer"

    @pytest.mark.asyncio
    async def test_empty_content_is_a_non_retryable_response_error(self, monkeypatch):
        _configure(monkeypatch)
        fake = _client(
            monkeypatch,
            _FakeResponse({"choices": [{"message": {"content": "   "}}]}),
        )

        with pytest.raises(ProviderResponseError, match="no usable text") as excinfo:
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert excinfo.value.code == "empty_response"
        # A permanent empty answer must not spend tenacity's retry budget.
        assert len(fake.calls) == 1

    @pytest.mark.asyncio
    async def test_null_content_never_uses_reasoning_as_the_answer(self, monkeypatch):
        _configure(monkeypatch)
        _client(
            monkeypatch,
            _FakeResponse(
                {
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {
                                "content": None,
                                "reasoning_content": "private chain of thought",
                            },
                        }
                    ]
                }
            ),
        )

        with pytest.raises(ProviderResponseError, match="reasoning_content") as excinfo:
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert excinfo.value.code == "empty_response"
        assert "private chain of thought" not in str(excinfo.value)
        assert "finish_reason='length'" in str(excinfo.value)

    @pytest.mark.asyncio
    async def test_response_without_choices_is_an_invalid_response(self, monkeypatch):
        _configure(monkeypatch)
        _client(monkeypatch, _FakeResponse({"choices": []}))

        with pytest.raises(ProviderResponseError, match="no choices") as excinfo:
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

        assert excinfo.value.code == "invalid_response"

    @pytest.mark.asyncio
    async def test_choices_that_are_not_objects_are_an_invalid_response(self, monkeypatch):
        _configure(monkeypatch)
        _client(monkeypatch, _FakeResponse({"choices": ["not-an-object"]}))

        with pytest.raises(ProviderResponseError, match="expected an object"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

    @pytest.mark.asyncio
    async def test_unexpected_message_shape_is_an_empty_response(self, monkeypatch):
        _configure(monkeypatch)
        _client(monkeypatch, _FakeResponse({"choices": [{"message": "not-an-object"}]}))

        with pytest.raises(ProviderResponseError, match="no usable text"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

    @pytest.mark.asyncio
    async def test_non_object_json_body_is_an_invalid_response(self, monkeypatch):
        _configure(monkeypatch)
        response = httpx.Response(
            200,
            request=httpx.Request("POST", API_URL),
            json=["not", "an", "object"],
        )
        _client(monkeypatch, response)

        with pytest.raises(ProviderResponseError, match="expected a JSON object"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

    @pytest.mark.asyncio
    async def test_non_json_success_body_is_an_invalid_response(self, monkeypatch):
        _configure(monkeypatch)
        response = httpx.Response(
            200,
            request=httpx.Request("POST", API_URL),
            text="<html>gateway</html>",
        )
        _client(monkeypatch, response)

        with pytest.raises(ProviderResponseError, match="non-JSON body"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

    @pytest.mark.asyncio
    async def test_empty_response_logs_safe_diagnostics_and_usage(self, monkeypatch):
        _configure(monkeypatch)
        diagnostics: list[dict] = []
        usage_events: list[dict] = []
        monkeypatch.setattr(
            "app.ai.providers.openai_compatible.log_event",
            lambda message, **fields: diagnostics.append({"message": message, **fields}),
        )
        monkeypatch.setattr(
            metrics,
            "log_event",
            lambda message, **fields: usage_events.append({"message": message, **fields}),
        )
        _client(
            monkeypatch,
            _FakeResponse(
                {
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {
                                "content": "",
                                "reasoning_content": "private chain of thought",
                            },
                        }
                    ],
                    "usage": {"prompt_tokens": 956, "completion_tokens": 2048},
                }
            ),
        )

        with pytest.raises(ProviderResponseError):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

        event = diagnostics[0]
        assert event["message"] == "ai provider response"
        assert event["provider"] == "tokenharbor"
        assert event["model"] == "deepseek-v4.1-flash:free"
        assert event["httpStatus"] == 200
        assert event["choiceCount"] == 1
        assert event["finishReason"] == "length"
        assert event["contentType"] == "str"
        assert event["contentChars"] == 0
        assert event["reasoningChars"] == len("private chain of thought")
        assert event["promptTokens"] == 956
        assert event["completionTokens"] == 2048
        # Diagnostics must never contain the prompt or the model's text.
        assert "private chain of thought" not in repr(diagnostics)

        assert usage_events[0]["message"] == "model usage"
        assert usage_events[0]["completionTokens"] == 2048


class TestTokenHarborConfiguration:
    @pytest.mark.asyncio
    async def test_not_configured_without_a_key(self, monkeypatch):
        _configure(monkeypatch, key="")

        assert await TokenHarborProvider().is_configured() is False
        with pytest.raises(ProviderConfigurationError, match="not configured"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

    def test_adapter_is_registered(self):
        assert registry.has("tokenharbor") is True
        assert isinstance(registry.get("tokenharbor"), TokenHarborProvider)

    def test_specific_mode_selects_tokenharbor(self, monkeypatch):
        monkeypatch.setattr(settings, "ai_provider", "tokenharbor")
        monkeypatch.setattr(settings, "ai_fallback_provider", "")

        assert isinstance(factory.get_llm_provider(), TokenHarborProvider)


class TestTokenHarborFailureHandling:
    @pytest.mark.asyncio
    async def test_forbidden_error_keeps_the_provider_code_and_is_not_retried(self, monkeypatch):
        _configure(monkeypatch)
        response = httpx.Response(
            403,
            request=httpx.Request("POST", API_URL),
            json={
                "error": {
                    "type": "email_verification_required",
                    "code": "email_verification_required",
                    "message": "Verify your email address to use the API.",
                }
            },
        )
        fake = _client(monkeypatch, response)

        with pytest.raises(httpx.HTTPStatusError) as excinfo:
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

        message = str(excinfo.value)
        assert "HTTP 403" in message
        assert "email_verification_required" in message
        assert "Verify your email address" in message
        assert len(fake.calls) == 1

    @pytest.mark.asyncio
    async def test_error_without_a_json_body_still_reports_the_status(self, monkeypatch):
        _configure(monkeypatch)
        response = httpx.Response(
            400,
            request=httpx.Request("POST", API_URL),
            text="bad request",
        )
        _client(monkeypatch, response)

        with pytest.raises(httpx.HTTPStatusError, match="HTTP 400"):
            await TokenHarborProvider().complete(_chat_request(prompt="p"))

    @pytest.mark.asyncio
    async def test_any_mode_skips_an_unconfigured_tokenharbor(self, monkeypatch):
        _configure(monkeypatch, key="")
        fake_name = "fake-any-fallback"

        class _Fallback:
            name = fake_name
            model = "fake-model"
            capabilities = ProviderCapabilities()

            def __init__(self) -> None:
                self.calls = 0

            async def is_configured(self) -> bool:
                return True

            async def is_available(self) -> bool:
                return True

            async def complete(self, _request):
                self.calls += 1
                return ChatResponse(text="fallback", provider=self.name, model=self.model)

        fallback = _Fallback()
        registry.register(fake_name, lambda: fallback)
        monkeypatch.setattr(settings, "ai_provider_mode", "any")
        monkeypatch.setattr(settings, "ai_provider", "tokenharbor")
        monkeypatch.setattr(settings, "ai_provider_order", f"tokenharbor,{fake_name}")
        monkeypatch.setattr(settings, "ai_fallback_provider", "")

        assert await factory.get_llm_provider().generate("prompt") == "fallback"
        assert fallback.calls == 1


def _chat_request(
    *,
    prompt: str = "prompt",
    temperature: float | None = None,
    max_tokens: int | None = None,
    seed: int | None = None,
) -> ChatRequest:
    return ChatRequest(
        prompt=prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        seed=seed,
    )
