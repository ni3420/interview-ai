"""Embeddings served by a deployed Cloudflare Worker proxying Workers AI.

The Worker owns the Cloudflare ``AI`` binding, so this service stores only the
Worker's URL and the bearer secret it checks against its own ``API_SECRET``.
No Cloudflare account token lives in this container.

Calls are synchronous because resume indexing and retrieval already run in a
threadpool off the event loop, which is also what LangChain's ``Embeddings``
interface requires.
"""

from __future__ import annotations

import httpx
from langchain_core.embeddings import Embeddings
from tenacity import (
    Retrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.metrics import log_event, timed

PROVIDER_NAME = "cloudflare-worker"

# Permanent problems are never re-attempted: a wrong key or a broken response
# contract will not fix itself, and retrying only burns wall-clock time in the
# resume-processing threadpool.
_RETRYABLE_STATUS = {408, 429}
_HTTP_UNAUTHORIZED = 401
_SERVER_ERROR_FLOOR = 500


class EmbeddingProviderError(RuntimeError):
    """The embedding worker could not produce usable vectors.

    ``retryable`` marks availability failures (rate limits, 5xx, transport), so
    the caller can retry with backoff instead of hammering a quota-limited
    worker. Everything else — auth, contract, dimension — fails fast.
    """

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        """Record the operator-facing message and whether retrying can help."""
        super().__init__(message)
        self.retryable = retryable


def _is_retryable(error: BaseException) -> bool:
    if isinstance(error, EmbeddingProviderError):
        return error.retryable
    return isinstance(error, httpx.RequestError)


class CloudflareWorkerEmbeddings(Embeddings):
    """``Embeddings`` implementation over the embedding Worker's HTTP contract.

    Request: ``POST {url}`` with ``{"text": ["chunk", ...]}`` and
    ``Authorization: Bearer {API_SECRET}``.
    Response: ``{"success": true, "model": ..., "count": n, "dimensions": d,
    "data": [[float, ...], ...]}`` with one vector per input, in order.
    """

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed every chunk, in batches, preserving input order."""
        if not texts:
            return []

        batch_size = max(1, settings.embedding_worker_batch_size)
        vectors: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            vectors.extend(self._embed_batch(texts[start : start + batch_size]))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        """Embed one retrieval query."""
        return self.embed_documents([text])[0]

    def _embed_batch(self, batch: list[str]) -> list[list[float]]:
        for attempt in Retrying(
            retry=retry_if_exception(_is_retryable),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            stop=stop_after_attempt(3),
            reraise=True,
        ):
            with attempt, timed("embedding.worker_call", chunkCount=len(batch)):
                return self._post_batch(batch)
        raise EmbeddingProviderError("embedding worker attempt loop exited")

    def _post_batch(self, batch: list[str]) -> list[list[float]]:
        url = settings.embedding_worker_url.strip().rstrip("/")
        try:
            response = httpx.post(
                url,
                json={"text": batch},
                headers={
                    "Authorization": f"Bearer {settings.embedding_worker_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=settings.embedding_worker_timeout_seconds,
            )
        except httpx.RequestError as error:
            raise EmbeddingProviderError(
                f"embedding worker request failed: {type(error).__name__}",
                retryable=True,
            ) from error

        self._raise_for_status(response)

        try:
            payload = response.json()
        except ValueError as error:
            raise EmbeddingProviderError(
                f"embedding worker returned non-JSON for HTTP {response.status_code}"
            ) from error

        if not isinstance(payload, dict) or payload.get("success") is not True:
            detail = ""
            if isinstance(payload, dict):
                detail = str(payload.get("error") or "")[:200]
            raise EmbeddingProviderError(
                "embedding worker rejected the request"
                + (f": {detail}" if detail else "")
            )

        reported_model = payload.get("model")
        if isinstance(reported_model, str) and reported_model != settings.embedding_model:
            # The model name is written into Qdrant point metadata, so a drift
            # here means stored provenance no longer matches reality.
            log_event(
                "embedding model mismatch",
                provider=PROVIDER_NAME,
                configured=settings.embedding_model,
                reported=reported_model,
            )

        return self._validate_vectors(payload.get("data"), expected=len(batch))

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if response.is_success:
            return
        status = response.status_code
        if status == _HTTP_UNAUTHORIZED:
            raise EmbeddingProviderError(
                "embedding worker rejected EMBEDDING_WORKER_API_KEY (401)"
            )
        raise EmbeddingProviderError(
            f"embedding worker returned HTTP {status}",
            retryable=status in _RETRYABLE_STATUS or status >= _SERVER_ERROR_FLOOR,
        )

    @staticmethod
    def _validate_vectors(data: object, *, expected: int) -> list[list[float]]:
        """Enforce count and dimension order before anything reaches Qdrant.

        A short or reshaped batch would silently misalign chunk indices against
        stored vectors, and a dimension change would write incompatible vectors
        into the live collection.
        """
        if not isinstance(data, list):
            raise EmbeddingProviderError(
                f"expected 'data' to be a list, got {type(data).__name__}"
            )
        if len(data) != expected:
            raise EmbeddingProviderError(
                f"worker returned {len(data)} vectors for {expected} inputs"
            )

        dimension = settings.embedding_dimension
        vectors: list[list[float]] = []
        for index, raw in enumerate(data):
            if not isinstance(raw, list) or len(raw) != dimension:
                actual = len(raw) if isinstance(raw, list) else type(raw).__name__
                raise EmbeddingProviderError(
                    f"vector {index} has length {actual}, expected {dimension}"
                )
            if not all(isinstance(number, (int, float)) for number in raw):
                raise EmbeddingProviderError(f"vector {index} contains non-numeric values")
            vectors.append([float(number) for number in raw])

        log_event(
            "embedding worker response",
            provider=PROVIDER_NAME,
            model=settings.embedding_model,
            vectorCount=len(vectors),
            dimension=dimension,
        )
        return vectors
