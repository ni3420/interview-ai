"""Structured timing events for the F9 latency budgets (G-19).

Each event is one JSON line so logs can be aggregated without parsing prose.
Field names are stable: ``operation``, ``stage``, ``durationMs``.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from contextlib import contextmanager
from typing import Any, Iterator

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
