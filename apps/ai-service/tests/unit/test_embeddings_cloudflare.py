import httpx
import pytest
import tenacity

from app.core.config import settings
from app.services import cloudflare_worker_embeddings as cf
from app.services import embeddings
from app.services.cloudflare_worker_embeddings import (
    CloudflareWorkerEmbeddings,
    EmbeddingProviderError,
)


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setattr(settings, "embedding_provider", "cloudflare")
    monkeypatch.setattr(settings, "embedding_worker_url", "https://embed.example.workers.dev")
    monkeypatch.setattr(settings, "embedding_worker_api_key", "worker-secret")
    monkeypatch.setattr(settings, "embedding_model", "@cf/baai/bge-base-en-v1.5")
    monkeypatch.setattr(settings, "embedding_dimension", 768)
    monkeypatch.setattr(settings, "embedding_worker_batch_size", 32)
    # Keep retry tests instant without changing production backoff.
    monkeypatch.setattr(settings, "embedding_worker_timeout_seconds", 5.0)
    embeddings.get_embeddings.cache_clear()
    yield
    embeddings.get_embeddings.cache_clear()


@pytest.fixture(autouse=True)
def _no_retry_delay(monkeypatch):
    real = tenacity.Retrying

    def instant(**kwargs):
        kwargs["wait"] = tenacity.wait_fixed(0)
        return real(**kwargs)

    monkeypatch.setattr(cf, "Retrying", instant)


class _Transport:
    """Stand in for ``httpx.post``; records requests, replays canned replies."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    def __call__(self, url, *, json=None, headers=None, timeout=None):
        self.requests.append({"url": url, "json": json, "headers": headers})
        status, body = self.replies[min(len(self.requests) - 1, len(self.replies) - 1)]
        return httpx.Response(status, json=body)

    @property
    def calls(self):
        return len(self.requests)


def _vectors(count, dimension=768):
    return [[0.5] * dimension for _ in range(count)]


def _ok(count, dimension=768):
    return {
        "success": True,
        "model": "@cf/baai/bge-base-en-v1.5",
        "count": count,
        "dimensions": dimension,
        "data": _vectors(count, dimension),
    }


def test_embed_documents_returns_vectors_in_input_order(monkeypatch):
    transport = _Transport([(200, _ok(2))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    result = CloudflareWorkerEmbeddings().embed_documents(["chunk a", "chunk b"])

    assert len(result) == 2
    assert all(len(vector) == 768 for vector in result)
    assert transport.requests[0]["json"] == {"text": ["chunk a", "chunk b"]}
    assert transport.requests[0]["headers"]["Authorization"] == "Bearer worker-secret"
    assert transport.requests[0]["url"] == "https://embed.example.workers.dev"


def test_embed_query_returns_a_single_vector(monkeypatch):
    transport = _Transport([(200, _ok(1))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    vector = CloudflareWorkerEmbeddings().embed_query("led the payments team")

    assert len(vector) == 768
    assert transport.calls == 1


def test_documents_are_batched_in_order(monkeypatch):
    monkeypatch.setattr(settings, "embedding_worker_batch_size", 2)
    transport = _Transport([(200, _ok(2)), (200, _ok(1))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    result = CloudflareWorkerEmbeddings().embed_documents(["a", "b", "c"])

    assert transport.calls == 2
    assert [request["json"]["text"] for request in transport.requests] == [["a", "b"], ["c"]]
    assert len(result) == 3


def test_empty_input_never_calls_the_worker(monkeypatch):
    transport = _Transport([(200, _ok(0))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    assert CloudflareWorkerEmbeddings().embed_documents([]) == []
    assert transport.calls == 0


def test_dimension_mismatch_is_rejected(monkeypatch):
    transport = _Transport([(200, _ok(1, dimension=1024))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    with pytest.raises(EmbeddingProviderError, match="expected 768"):
        CloudflareWorkerEmbeddings().embed_query("text")


def test_vector_count_mismatch_is_rejected(monkeypatch):
    transport = _Transport([(200, _ok(1))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    with pytest.raises(EmbeddingProviderError, match="1 vectors for 2 inputs"):
        CloudflareWorkerEmbeddings().embed_documents(["a", "b"])


def test_unauthorized_is_not_retried(monkeypatch):
    transport = _Transport([(401, {"success": False, "error": "Unauthorized"})])
    monkeypatch.setattr(cf.httpx, "post", transport)

    with pytest.raises(EmbeddingProviderError, match="401"):
        CloudflareWorkerEmbeddings().embed_query("text")

    assert transport.calls == 1


def test_rate_limit_is_retried_then_raised(monkeypatch):
    transport = _Transport([(429, {"success": False, "error": "over quota"})])
    monkeypatch.setattr(cf.httpx, "post", transport)

    with pytest.raises(EmbeddingProviderError, match="429"):
        CloudflareWorkerEmbeddings().embed_query("text")

    assert transport.calls == 3


def test_retryable_failure_can_recover(monkeypatch):
    transport = _Transport([(500, {"success": False}), (200, _ok(1))])
    monkeypatch.setattr(cf.httpx, "post", transport)

    assert len(CloudflareWorkerEmbeddings().embed_query("text")) == 768
    assert transport.calls == 2


def test_worker_success_false_raises_with_provider_message(monkeypatch):
    transport = _Transport([(200, {"success": False, "error": "batch too large"})])
    monkeypatch.setattr(cf.httpx, "post", transport)

    with pytest.raises(EmbeddingProviderError, match="batch too large"):
        CloudflareWorkerEmbeddings().embed_query("text")


def test_get_embeddings_selects_the_worker_provider():
    assert isinstance(embeddings.get_embeddings(), CloudflareWorkerEmbeddings)


def test_missing_worker_url_fails_fast(monkeypatch):
    monkeypatch.setattr(settings, "embedding_worker_url", "")

    with pytest.raises(ValueError, match="EMBEDDING_WORKER_URL"):
        embeddings.get_embeddings()


def test_missing_worker_key_fails_fast(monkeypatch):
    monkeypatch.setattr(settings, "embedding_worker_api_key", "")

    with pytest.raises(ValueError, match="EMBEDDING_WORKER_API_KEY"):
        embeddings.get_embeddings()


def test_provider_alias_and_supported_list(monkeypatch):
    monkeypatch.setattr(settings, "embedding_provider", "  Cloudflare-Worker ")
    assert isinstance(embeddings.get_embeddings(), CloudflareWorkerEmbeddings)

    # The resolver is cached, so a provider change needs a cache reset.
    embeddings.get_embeddings.cache_clear()
    monkeypatch.setattr(settings, "embedding_provider", "openai")
    with pytest.raises(ValueError, match="ollama, cloudflare"):
        embeddings.get_embeddings()
