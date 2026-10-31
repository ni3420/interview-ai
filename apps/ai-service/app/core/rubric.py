"""Single source of truth for question scoring.

Weights are percentages and must always sum to 100. The model returns a 0-10
sub-score per criterion; weighted totals are computed here in code so a model
cannot inflate a question score by returning its own overall number.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from app.core.config import settings

RUBRIC_VERSION = "rubric-v1"
SCORE_SCALE = 10
PERCENT_TOTAL = 100


@dataclass(frozen=True)
class Criterion:
    id: str
    label: str
    weight: int


DEFAULT_RUBRIC: tuple[Criterion, ...] = (
    Criterion("technical_correctness", "Technical correctness", 30),
    Criterion("relevance", "Relevance", 20),
    Criterion("conceptual_understanding", "Conceptual understanding", 15),
    Criterion("completeness", "Completeness", 15),
    Criterion("problem_solving", "Problem-solving / practical experience", 10),
    Criterion("communication", "Communication clarity", 10),
)

# Anchors shared with the prompt so the model and the UI describe scores the
# same way.
SCORE_ANCHORS: tuple[tuple[str, str], ...] = (
    ("9-10", "Excellent: accurate, complete and well explained."),
    ("7-8", "Good: correct with minor gaps or imprecision."),
    ("5-6", "Partial: some correct content but important gaps."),
    ("3-4", "Weak: limited understanding or significant errors."),
    ("1-2", "Very limited: mostly incorrect or irrelevant."),
    ("0", "No valid answer, or entirely wrong."),
)


class RubricError(ValueError):
    """The configured rubric is not usable."""


def build_rubric(
    overrides: Mapping[str, int] | None = None,
) -> tuple[Criterion, ...]:
    """Apply optional config overrides and validate the result.

    Unknown criterion ids are rejected rather than silently ignored, so a typo
    in configuration fails fast instead of quietly changing the scoring mix.
    """
    criteria = {criterion.id: criterion for criterion in DEFAULT_RUBRIC}

    if overrides:
        unknown = sorted(set(overrides) - set(criteria))
        if unknown:
            raise RubricError(f"Unknown rubric criteria: {', '.join(unknown)}")
        for criterion_id, weight in overrides.items():
            criterion = criteria[criterion_id]
            criteria[criterion_id] = Criterion(
                criterion.id, criterion.label, int(weight)
            )

    resolved = tuple(criteria[criterion.id] for criterion in DEFAULT_RUBRIC)
    validate_rubric(resolved)
    return resolved


def validate_rubric(criteria: Iterable[Criterion]) -> None:
    resolved = tuple(criteria)
    if not resolved:
        raise RubricError("Rubric must contain at least one criterion")

    ids = [criterion.id for criterion in resolved]
    if len(ids) != len(set(ids)):
        raise RubricError("Rubric criterion ids must be unique")

    for criterion in resolved:
        if criterion.weight < 0:
            raise RubricError(f"Criterion {criterion.id} has a negative weight")

    total = sum(criterion.weight for criterion in resolved)
    if total != PERCENT_TOTAL:
        raise RubricError(f"Rubric weights must sum to {PERCENT_TOTAL}, got {total}")


def active_rubric() -> tuple[Criterion, ...]:
    """The rubric for this deployment, including configured weight overrides."""
    return build_rubric(settings.report_rubric_weights)
