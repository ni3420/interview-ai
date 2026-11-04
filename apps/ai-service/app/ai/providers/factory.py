"""Central provider selection.

The rest of the service calls ``get_llm_provider()`` and never sees provider
names or vendor modules. Selection is controlled by:

* ``AI_PROVIDER``          - primary/preferred provider (specific/any/all)
* ``AI_FALLBACK_PROVIDER`` - fallback for specific mode; also appended to the
                             candidate list for any/all when set
* ``AI_PROVIDER_MODE``     - ``specific`` (default), ``any`` or ``all``
* ``AI_PROVIDER_ORDER``    - comma-separated candidate names for any/all;
                             empty means every registered provider
"""

from __future__ import annotations

import logging

from app.ai.providers.base import LLMProvider, ProviderConfigurationError
from app.ai.providers.fallback import FallbackLLMProvider
from app.ai.providers.registry import registry
from app.ai.providers.routing import RoutingLLMProvider, provider_health
from app.core.config import settings

logger = logging.getLogger(__name__)

_SELECTION_MODES = {"specific", "any", "all"}


def _resolve_provider(name: str) -> LLMProvider:
    return registry.get(name)


def _mode() -> str:
    mode = settings.ai_provider_mode.strip().lower()
    if mode not in _SELECTION_MODES:
        raise ProviderConfigurationError(
            f"Unsupported AI provider selection mode: {settings.ai_provider_mode}"
        )
    return mode


def _primary_name() -> str:
    name = settings.ai_provider.strip().lower()
    if not name:
        raise ProviderConfigurationError(
            "AI_PROVIDER must name a provider (for example: tokenharbor, ollama or gemini)"
        )
    return name


def _fallback_name() -> str:
    return settings.ai_fallback_provider.strip().lower()


def _order_names() -> list[str]:
    return [
        part.strip().lower()
        for part in settings.ai_provider_order.split(",")
        if part.strip()
    ]


def candidate_names() -> tuple[str, ...]:
    """Ordered provider names for any/all mode, with the primary first."""
    names = _order_names() or list(registry.names())
    primary = _primary_name()
    if primary not in names:
        names.insert(0, primary)

    fallback = _fallback_name()
    if fallback and fallback not in names:
        names.append(fallback)

    deduped: list[str] = []
    for name in names:
        if name not in deduped:
            deduped.append(name)
    return tuple(deduped)


def get_llm_provider() -> LLMProvider:
    """Resolve the configured provider(s) for the current selection mode.

    ``specific`` keeps the original primary/fallback behaviour. ``any`` and
    ``all`` return a router that performs its own health checks and error
    normalization.
    """
    mode = _mode()
    primary_name = _primary_name()

    if mode == "specific":
        primary = _resolve_provider(primary_name)
        fallback_name = _fallback_name()
        if not fallback_name or fallback_name == primary_name:
            return primary

        fallback = _resolve_provider(fallback_name)
        return FallbackLLMProvider(
            primary=primary,
            fallback=fallback,
            fallback_available=lambda: provider_health.is_available(fallback),
            fallback_name=fallback_name,
        )

    providers = [_resolve_provider(name) for name in candidate_names()]
    return RoutingLLMProvider(providers, mode=mode)


def provider_log_fields() -> dict[str, str]:
    """Provider/model fields for structured logs, independent of vendor name."""
    mode = _mode()
    if mode == "specific":
        provider = _resolve_provider(_primary_name())
        return {
            "configuredProvider": str(provider.name),
            "configuredModel": str(provider.model),
        }

    models = ",".join(
        f"{name}:{_resolve_provider(name).model}" for name in candidate_names()
    )
    return {"configuredProvider": mode, "configuredModel": models}


def provider_config_problems() -> list[str]:
    """Static configuration problems that should fail startup.

    Missing API keys are intentionally not fatal in development: ``any`` mode
    can skip an unconfigured provider, and a specific-mode request returns a
    clear error when the selected provider cannot run.
    """
    problems: list[str] = []

    mode = settings.ai_provider_mode.strip().lower()
    if mode not in _SELECTION_MODES:
        problems.append(
            f"AI_PROVIDER_MODE must be one of {sorted(_SELECTION_MODES)}, "
            f"got {settings.ai_provider_mode!r}"
        )

    primary = settings.ai_provider.strip().lower()
    if not primary:
        problems.append("AI_PROVIDER must name a provider")
    elif not registry.has(primary):
        problems.append(f"Unsupported AI provider: {primary} (AI_PROVIDER)")

    fallback = _fallback_name()
    if fallback and not registry.has(fallback):
        problems.append(
            f"Unsupported AI provider: {fallback} (AI_FALLBACK_PROVIDER)"
        )

    for name in _order_names():
        if not registry.has(name):
            problems.append(f"Unsupported AI provider: {name} (AI_PROVIDER_ORDER)")

    if mode in {"any", "all"}:
        names = _order_names() or list(registry.names())
        if not names and not primary:
            problems.append("No AI providers are registered for any/all mode")

    return problems


def validate_provider_config() -> None:
    """Fail fast on unusable names/modes before the service accepts traffic."""
    problems = provider_config_problems()
    if problems:
        raise ProviderConfigurationError("; ".join(problems))

    mode = _mode()
    if mode == "specific":
        logger.info(
            "AI provider mode=specific primary=%s fallback=%s",
            _primary_name(),
            _fallback_name() or "disabled",
        )
    else:
        logger.info(
            "AI provider mode=%s candidates=%s",
            mode,
            ",".join(candidate_names()),
        )
