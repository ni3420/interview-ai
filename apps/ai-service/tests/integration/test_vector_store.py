"""Integration tests against real local Qdrant and Ollama.

Skipped automatically when either service is unreachable, so they never break
deterministic CI.
"""

import httpx
import pytest

from app.core.config import settings
from app.repositories import vector_store

pytestmark = pytest.mark.integration

RESUME_ID = "integration-resume"
USER_ID = "integration-user"

CHUNKS = [
    "Built a real-time analytics dashboard with React and TypeScript.",
    "Led a team of four engineers delivering a payments service.",
    "Designed PostgreSQL schemas and optimized slow queries.",
]


def _reachable(url: str) -> bool:
    try:
        httpx.get(url, timeout=3.0)
        return True
    except Exception:
        return False


def _services_available() -> bool:
    return _reachable(f"{settings.qdrant_url}/healthz") and _reachable(
        f"{settings.ollama_base_url}/api/tags"
    )


requires_services = pytest.mark.skipif(
    not _services_available(),
    reason="Qdrant and/or Ollama are not reachable",
)


@requires_services
def test_index_and_retrieve_is_idempotent_and_user_scoped():
    vector_store.delete_resume_vectors(USER_ID, RESUME_ID)

    first = vector_store.index_resume(USER_ID, RESUME_ID, CHUNKS)
    assert first == len(CHUNKS)

    # Re-indexing the same resume must not create duplicate points.
    second = vector_store.index_resume(USER_ID, RESUME_ID, CHUNKS)
    assert second == len(CHUNKS)

    stored = vector_store.get_client().count(
        collection_name=settings.qdrant_collection,
        count_filter=vector_store._resume_filter(USER_ID, RESUME_ID),
        exact=True,
    ).count
    assert stored == len(CHUNKS)

    results = vector_store.search_resume(
        USER_ID, RESUME_ID, "payments team leadership", limit=2
    )
    assert results
    assert all(0 <= index < len(CHUNKS) for _, index, _ in results)

    # A different user must not see this resume's chunks.
    assert vector_store.search_resume("someone-else", RESUME_ID, "payments", 5) == []

    vector_store.delete_resume_vectors(USER_ID, RESUME_ID)
