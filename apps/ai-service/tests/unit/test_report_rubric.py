import pytest

from app.core.rubric import (
    DEFAULT_RUBRIC,
    RUBRIC_VERSION,
    Criterion,
    RubricError,
    SCORE_ANCHORS,
    SCORE_SCALE,
    build_rubric,
    validate_rubric,
)


def test_default_rubric_weights_sum_to_one_hundred():
    assert sum(criterion.weight for criterion in DEFAULT_RUBRIC) == 100
    assert RUBRIC_VERSION == "rubric-v1"
    assert SCORE_SCALE == 10


def test_default_rubric_has_the_six_required_criteria():
    assert [criterion.id for criterion in DEFAULT_RUBRIC] == [
        "technical_correctness",
        "relevance",
        "conceptual_understanding",
        "completeness",
        "problem_solving",
        "communication",
    ]
    assert [criterion.weight for criterion in DEFAULT_RUBRIC] == [30, 20, 15, 15, 10, 10]


def test_anchors_cover_the_full_scale():
    assert [anchor for anchor, _ in SCORE_ANCHORS] == [
        "9-10",
        "7-8",
        "5-6",
        "3-4",
        "1-2",
        "0",
    ]


def test_rubric_overrides_must_use_known_ids_and_sum_to_one_hundred():
    with pytest.raises(RubricError):
        build_rubric({"unknown_criterion": 10})

    with pytest.raises(RubricError):
        build_rubric({"technical_correctness": 20})

    rubric = build_rubric({"technical_correctness": 20, "relevance": 30})
    assert rubric[0].weight == 20
    assert sum(criterion.weight for criterion in rubric) == 100


def test_validate_rejects_duplicate_ids_and_bad_weights():
    with pytest.raises(RubricError):
        validate_rubric([DEFAULT_RUBRIC[0], DEFAULT_RUBRIC[0]])

    with pytest.raises(RubricError):
        validate_rubric(
            [
                Criterion("technical_correctness", "Technical correctness", -10),
                *DEFAULT_RUBRIC[1:],
            ]
        )
