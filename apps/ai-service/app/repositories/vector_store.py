"""Qdrant vector store for resume chunks, accessed through LangChain.

Design notes:
- Point ids are deterministic (``uuid5`` of the embedding config version,
  resume id and chunk index) so re-indexing the same resume is idempotent.
- Every point carries ``user_id`` and ``resume_id`` metadata; retrieval always
  filters on both, so one user can never read another user's resume context.
- The embedding model and configuration version are stored on each point and
  the collection dimension is checked before use, so vectors from incompatible
  embedding models are never mixed.
"""

from __future__ import annotations

import uuid
from functools import lru_cache

from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.core.config import settings
from app.services.embeddings import get_embeddings

# Stable namespace so point ids are reproducible across restarts.
_POINT_NAMESPACE = uuid.UUID("9f1c1c8e-9a4e-4b6b-9f2e-2f0d5b7c1a11")


class VectorStoreConfigError(RuntimeError):
    """The existing collection is incompatible with the configured embeddings."""


@lru_cache(maxsize=1)
def get_client() -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )


@lru_cache(maxsize=1)
def get_vector_store() -> QdrantVectorStore:
    return QdrantVectorStore(
        client=get_client(),
        collection_name=settings.qdrant_collection,
        embedding=get_embeddings(),
    )


def _point_id(resume_id: str, chunk_index: int) -> str:
    return str(
        uuid.uuid5(
            _POINT_NAMESPACE,
            f"{settings.embedding_config_version}:{resume_id}:{chunk_index}",
        )
    )


def _resume_filter(user_id: str, resume_id: str) -> qmodels.Filter:
    return qmodels.Filter(
        must=[
            qmodels.FieldCondition(
                key="metadata.user_id", match=qmodels.MatchValue(value=user_id)
            ),
            qmodels.FieldCondition(
                key="metadata.resume_id", match=qmodels.MatchValue(value=resume_id)
            ),
        ]
    )


def _existing_vector_size() -> int | None:
    info = get_client().get_collection(settings.qdrant_collection)
    vectors = info.config.params.vectors
    if isinstance(vectors, dict):  # named vectors
        first = next(iter(vectors.values()), None)
        return getattr(first, "size", None)
    return getattr(vectors, "size", None)


def _collection_exists() -> bool:
    names = {collection.name for collection in get_client().get_collections().collections}
    return settings.qdrant_collection in names


def ensure_collection() -> None:
    """Create the collection if missing; fail loudly on a dimension mismatch."""
    client = get_client()
    if _collection_exists():
        size = _existing_vector_size()
        if size is not None and size != settings.embedding_dimension:
            raise VectorStoreConfigError(
                f"Collection '{settings.qdrant_collection}' has dimension {size}, "
                f"but embeddings are configured for {settings.embedding_dimension}. "
                "Re-index with a matching collection or embedding model."
            )
        return

    client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=qmodels.VectorParams(
            size=settings.embedding_dimension,
            distance=qmodels.Distance.COSINE,
        ),
    )


def delete_resume_vectors(user_id: str, resume_id: str) -> None:
    """Remove every stored vector for a resume (idempotent, user-scoped)."""
    if not _collection_exists():
        return
    get_client().delete(
        collection_name=settings.qdrant_collection,
        points_selector=qmodels.FilterSelector(
            filter=_resume_filter(user_id, resume_id)
        ),
        wait=True,
    )


def index_resume(user_id: str, resume_id: str, chunks: list[str]) -> int:
    """(Re)index a resume, replacing any previous vectors for it."""
    ensure_collection()
    delete_resume_vectors(user_id, resume_id)

    if not chunks:
        return 0

    documents = [
        Document(
            page_content=chunk,
            metadata={
                "user_id": user_id,
                "resume_id": resume_id,
                "chunk_index": index,
                "embedding_model": settings.embedding_model,
                "embedding_version": settings.embedding_config_version,
            },
        )
        for index, chunk in enumerate(chunks)
    ]
    ids = [_point_id(resume_id, index) for index in range(len(chunks))]
    get_vector_store().add_documents(documents, ids=ids)
    return len(documents)


def search_resume(
    user_id: str,
    resume_id: str,
    query: str,
    limit: int = 5,
) -> list[tuple[str, int, float]]:
    """Return ``(text, chunk_index, score)`` for authorized chunks only."""
    ensure_collection()
    results = get_vector_store().similarity_search_with_score(
        query,
        k=limit,
        filter=_resume_filter(user_id, resume_id),
    )
    return [
        (document.page_content, int(document.metadata.get("chunk_index", 0)), float(score))
        for document, score in results
    ]
