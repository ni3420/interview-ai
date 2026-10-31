from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.metrics import record_usage


class GeminiProvider:
    def __init__(self):
        # The client is created lazily so the service (and its tests) can be
        # imported without GEMINI_API_KEY configured.
        self._client: genai.Client | None = None

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
    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str:
        config: dict[str, object] = {
            "temperature": (
                settings.gemini_temperature
                if temperature is None
                else temperature
            ),
            "max_output_tokens": (
                settings.gemini_max_tokens if max_tokens is None else max_tokens
            ),
        }
        if seed is not None:
            config["seed"] = seed

        response = await self._get_client().aio.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
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
        record_usage(
            provider="gemini",
            model=settings.gemini_model,
            prompt_tokens=getattr(usage, "prompt_token_count", None),
            completion_tokens=completion,
        )
        return response.text.strip()


gemini_provider = GeminiProvider()
