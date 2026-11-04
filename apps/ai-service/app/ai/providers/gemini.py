from __future__ import annotations

from time import perf_counter

from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from app.ai.providers.base import (
    BaseChatProvider,
    ChatRequest,
    ChatResponse,
    ProviderCapabilities,
    TokenUsage,
)
from app.ai.providers.registry import registry
from app.core.config import settings
from app.core.metrics import record_usage


class GeminiProvider(BaseChatProvider):
    name = "gemini"
    capabilities = ProviderCapabilities(
        temperature=True,
        max_tokens=True,
        seed=True,
        json_mode=True,
        streaming=True,
    )

    def __init__(self) -> None:
        # The client is created lazily so the service (and its tests) can be
        # imported without GEMINI_API_KEY configured.
        self._client: genai.Client | None = None

    @property
    def model(self) -> str:
        return settings.gemini_model

    async def is_configured(self) -> bool:
        return bool(settings.gemini_api_key.strip())

    def _get_client(self) -> genai.Client:
        if self._client is None:
            if not settings.gemini_api_key:
                raise ValueError("GEMINI_API_KEY not configured")
            self._client = genai.Client(api_key=settings.gemini_api_key)
        return self._client

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
    )
    async def complete(self, request: ChatRequest) -> ChatResponse:
        started = perf_counter()
        config: dict[str, object] = {
            "temperature": (
                settings.gemini_temperature
                if request.temperature is None
                else request.temperature
            ),
            "max_output_tokens": (
                settings.gemini_max_tokens
                if request.max_tokens is None
                else request.max_tokens
            ),
        }
        if request.seed is not None:
            config["seed"] = request.seed

        response = await self._get_client().aio.models.generate_content(
            model=self.model,
            contents=request.prompt,
            config=types.GenerateContentConfig(**config),
        )
        if not response.text:
            raise ValueError("Empty response from Gemini")

        usage = response.usage_metadata
        candidates = getattr(usage, "candidates_token_count", None)
        thoughts = getattr(usage, "thoughts_token_count", None)
        # Thinking tokens are billed as output but are not part of the visible
        # candidate text, so include them in the completion count.
        completion = (
            None
            if candidates is None and thoughts is None
            else (candidates or 0) + (thoughts or 0)
        )
        prompt_tokens = getattr(usage, "prompt_token_count", None)
        record_usage(
            provider=self.name,
            model=self.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion,
        )
        return ChatResponse(
            text=response.text.strip(),
            provider=self.name,
            model=self.model,
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion,
            ),
            latency_ms=round((perf_counter() - started) * 1000, 1),
        )


registry.register("gemini", GeminiProvider)
