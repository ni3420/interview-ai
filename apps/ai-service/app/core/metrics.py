"""Structured timing and model-usage events for the F9 budgets (G-19).

Each event is one JSON line so logs can be aggregated without parsing prose.
Field names are stable: ``operation``, ``stage``, ``durationMs`` and, for model
calls, ``promptTokens``/``completionTokens``/``totalTokens``/``estimatedCostUsd``.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

from app.core.config import settings

logger = logging.getLogger("interview_ai.timing")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def log_event(message: str, **fields: Any) -> None:
    logger.info(json.dumps({"level": "info", "message": message, **fields}, default=str))


@contextmanager
def timed(operation: str, **fields: Any) -> Iterator[None]:
    """Log one timing event for the wrapped block, including on failure."""
    started = time.perf_counter()
    try:
        yield
    finally:
        log_event(
            "timing",
            operation=operation,
            durationMs=round((time.perf_counter() - started) * 1000, 1),
            **fields,
        )


_usage_context: ContextVar[dict[str, str] | None] = ContextVar(
    "usage_context", default=None
)


@contextmanager
def usage_context(
    operation: str, interview_id: str | None = None
) -> Iterator[None]:
    """Attribute model-usage events to one request.

    Providers read this context when a call succeeds, so cost can be summed per
    interview without threading an id through every service function. The
    context is per-task and reset on exit.
    """
    value = {"operation": operation}
    if interview_id:
        value["interviewId"] = interview_id
    token = _usage_context.set(value)
    try:
        yield
    finally:
        _usage_context.reset(token)


def estimated_cost_usd(
    provider: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
) -> float | None:
    """Cost estimate from operator-configured prices.

    Prices are intentionally not hardcoded: provider pricing changes and an
    invented number is worse than none. Local Ollama inference is free at the
    margin. Unset prices or missing token counts yield ``None``.
    """
    if provider == "ollama":
        return 0.0
    if provider == "gemini":
        input_price = settings.gemini_input_price_per_1m
        output_price = settings.gemini_output_price_per_1m
    elif provider == "tokenharbor":
        input_price = settings.tokenharbor_input_price_per_1m
        output_price = settings.tokenharbor_output_price_per_1m
    else:
        return None

    if (
        input_price is None
        or output_price is None
        or prompt_tokens is None
        or completion_tokens is None
    ):
        return None
    return round(
        (prompt_tokens / 1_000_000) * input_price
        + (completion_tokens / 1_000_000) * output_price,
        6,
    )


def record_usage(
    *,
    provider: str,
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
) -> None:
    """Log one model call's token usage, attributed to the active context."""
    context = _usage_context.get() or {}
    fields: dict[str, Any] = {
        "operation": context.get("operation", "unknown"),
        "provider": provider,
        "model": model,
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": (
            None
            if prompt_tokens is None and completion_tokens is None
            else (prompt_tokens or 0) + (completion_tokens or 0)
        ),
        "estimatedCostUsd": estimated_cost_usd(
            provider, prompt_tokens, completion_tokens
        ),
    }
    if "interviewId" in context:
        fields["interviewId"] = context["interviewId"]
    log_event("model usage", **fields)
