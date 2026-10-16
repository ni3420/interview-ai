from typing import Protocol

from app.ai.providers.gemini import gemini_provider
from app.ai.providers.ollama import ollama_provider
from app.core.config import settings


class LLMProvider(Protocol):
    """Minimal provider contract used by the interview endpoints."""

    async def generate(self, prompt: str) -> str: ...


def get_llm_provider() -> LLMProvider:
    """Resolve the configured provider without hardcoding a model in logic."""
    provider = settings.ai_provider.strip().lower()
    if provider == "ollama":
        return ollama_provider
    if provider == "gemini":
        return gemini_provider
    raise ValueError(f"Unsupported AI provider: {settings.ai_provider}")
