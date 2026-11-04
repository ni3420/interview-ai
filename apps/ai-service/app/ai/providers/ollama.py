from __future__ import annotations

from time import perf_counter

import httpx
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


class OllamaProvider(BaseChatProvider):
    """Local model inference through Ollama.

    Kept behind the same normalized interface as every other provider so
    business logic never depends on a specific model. Ollama is only contacted
    when this provider is actually invoked.
    """

    name = "ollama"
    capabilities = ProviderCapabilities(
        temperature=True,
        max_tokens=True,
        seed=True,
        json_mode=False,
        streaming=False,
    )

    @property
    def model(self) -> str:
        return settings.ollama_model

    async def is_configured(self) -> bool:
        return bool(settings.ollama_base_url.strip())

    async def is_available(self) -> bool:
        """Whether Ollama is reachable and the configured model is installed.

        Used before switching away from a failing primary provider, so an
        unreachable or model-less Ollama never hides the original error.
        """
        try:
            async with httpx.AsyncClient(
                base_url=settings.ollama_base_url, timeout=3.0
            ) as client:
                response = await client.get("/api/tags")
                response.raise_for_status()
                models = {
                    str(model.get("name", ""))
                    for model in response.json().get("models", [])
                }
        except Exception:
            return False

        return (
            settings.ollama_model in models
            or f"{settings.ollama_model}:latest" in models
        )

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
    )
    async def complete(self, request: ChatRequest) -> ChatResponse:
        started = perf_counter()
        options: dict[str, object] = {
            "temperature": (
                settings.ollama_temperature
                if request.temperature is None
                else request.temperature
            ),
            "num_predict": (
                settings.ollama_max_tokens
                if request.max_tokens is None
                else request.max_tokens
            ),
        }
        if request.seed is not None:
            options["seed"] = request.seed

        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds
        ) as client:
            response = await client.post(
                "/api/generate",
                json={
                    "model": self.model,
                    "prompt": request.prompt,
                    "stream": False,
                    "options": options,
                },
            )
            response.raise_for_status()
            data = response.json()

        text = (data.get("response") or "").strip()
        if not text:
            raise ValueError("Empty response from Ollama")

        prompt_tokens = data.get("prompt_eval_count")
        completion_tokens = data.get("eval_count")
        record_usage(
            provider=self.name,
            model=self.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        return ChatResponse(
            text=text,
            provider=self.name,
            model=self.model,
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            ),
            latency_ms=round((perf_counter() - started) * 1000, 1),
        )


registry.register("ollama", OllamaProvider)
