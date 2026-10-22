from app.ai.providers.base import LLMProvider
from app.ai.providers.fallback import FallbackLLMProvider
from app.ai.providers.gemini import gemini_provider
from app.ai.providers.ollama import ollama_provider
from app.core.config import settings


def _resolve_provider(name: str) -> LLMProvider:
    if name == "ollama":
        return ollama_provider
    if name == "gemini":
        return gemini_provider
    raise ValueError(f"Unsupported AI provider: {name}")


async def _is_available(provider: LLMProvider) -> bool:
    """Health-check a provider that exposes one; remote providers are tried."""
    check = getattr(provider, "is_available", None)
    if check is None:
        return True
    return bool(await check())


def get_llm_provider() -> LLMProvider:
    """Resolve the configured provider and its local fallback.

    The primary is used while healthy. When it hits quota/5xx/timeout errors,
    the fallback is used only if it is actually reachable with the configured
    model, so a misconfigured fallback never hides the original error.
    """
    primary_name = settings.ai_provider.strip().lower()
    primary = _resolve_provider(primary_name)

    fallback_name = settings.ai_fallback_provider.strip().lower()
    if not fallback_name or fallback_name == primary_name:
        return primary

    fallback = _resolve_provider(fallback_name)
    return FallbackLLMProvider(
        primary=primary,
        fallback=fallback,
        fallback_available=lambda: _is_available(fallback),
        fallback_name=fallback_name,
    )
