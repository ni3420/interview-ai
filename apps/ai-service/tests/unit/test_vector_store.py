"""Tenant-scoping tests for the resume vector store.

Retrieval, deletion and indexing must always carry both ``user_id`` and
``resume_id``, so a signed request for one tenant can never touch another
tenant's chunks.
"""

from __future__ import annotations

import pytest
from qdrant_client.http import models as qmodels

from app.repositories import vector_store


def _conditions(flt: qmodels.Filter) -> set[tuple[str, str]]:
    return {(condition.key, condition.match.value) for condition in flt.must}


class _FakeVectorStore:
    def __init__(self) -> None:
        self.search_calls: list[dict] = []
        self.added: list = []

    def similarity_search_with_score(self, query, k, filter):  # noqa: A002
        self.search_calls.append({"query": query, "k": k, "filter": filter})
        return []

    def add_documents(self, documents, ids):
        self.added.append((documents, ids))


@pytest.fixture
def store(monkeypatch):
    fake = _FakeVectorStore()
    monkeypatch.setattr(vector_store, "ensure_collection", lambda: None)
    monkeypatch.setattr(vector_store, "get_vector_store", lambda: fake)
    return fake


def test_search_resume_filters_by_owner_and_resume(store):
    vector_store.search_resume("user-1", "resume-1", "react", limit=3)

    assert store.search_calls[0]["k"] == 3
    assert _conditions(store.search_calls[0]["filter"]) == {
        ("metadata.user_id", "user-1"),
        ("metadata.resume_id", "resume-1"),
    }


def test_search_resume_uses_the_requesting_tenant(store):
    vector_store.search_resume("user-2", "resume-1", "react")

    conditions = _conditions(store.search_calls[0]["filter"])
    assert ("metadata.user_id", "user-2") in conditions
    assert ("metadata.user_id", "user-1") not in conditions


def test_delete_resume_vectors_is_scoped(monkeypatch):
    calls: list[dict] = []

    class FakeClient:
        def delete(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(vector_store, "_collection_exists", lambda: True)
    monkeypatch.setattr(vector_store, "get_client", lambda: FakeClient())

    vector_store.delete_resume_vectors("user-1", "resume-1")

    selector = calls[0]["points_selector"]
    assert isinstance(selector, qmodels.FilterSelector)
    assert _conditions(selector.filter) == {
        ("metadata.user_id", "user-1"),
        ("metadata.resume_id", "resume-1"),
    }


def test_index_resume_stamps_tenant_metadata(store, monkeypatch):
    monkeypatch.setattr(vector_store, "delete_resume_vectors", lambda *_: None)

    assert vector_store.index_resume("user-1", "resume-1", ["a", "b"]) == 2

    documents, ids = store.added[0]
    assert len(ids) == 2
    for document in documents:
        assert document.metadata["user_id"] == "user-1"
        assert document.metadata["resume_id"] == "resume-1"
