import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings


class OllamaProvider:
    """Local model inference through Ollama.

    Kept behind the same ``generate(prompt) -> str`` interface as the Gemini
    provider so business logic never depends on a specific model. Ollama is
    only contacted when this provider is actually invoked.
    """

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
    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str:
        options: dict[str, object] = {
            "temperature": (
                settings.ollama_temperature
                if temperature is None
                else temperature
            ),
            "num_predict": (
                settings.ollama_max_tokens if max_tokens is None else max_tokens
            ),
        }
        if seed is not None:
            options["seed"] = seed

        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds
        ) as client:
            response = await client.post(
                "/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": options,
                },
            )
            response.raise_for_status()
            data = response.json()

        text = (data.get("response") or "").strip()
        if not text:
            raise ValueError("Empty response from Ollama")
        return text


ollama_provider = OllamaProvider()
