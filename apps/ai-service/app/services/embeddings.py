"""Embedding provider selection for resume indexing and retrieval.

Both supported providers satisfy LangChain's ``Embeddings`` interface, so the
vector store never learns which one is configured.
"""

from functools import lru_cache

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings

from app.core.config import settings
from app.services.cloudflare_worker_embeddings import CloudflareWorkerEmbeddings


def _ollama_embeddings() -> OllamaEmbeddings:
    """Local Ollama embeddings (development default: nomic-embed-text, 768-d)."""
    return OllamaEmbeddings(
        model=settings.embedding_model,
        base_url=settings.ollama_base_url,
    )


def _cloudflare_embeddings() -> CloudflareWorkerEmbeddings:
    """Remote embeddings from the deployed Cloudflare Worker.

    An unconfigured provider fails fast rather than falling back to Ollama:
    two different models writing into one collection produces vectors that are
    individually valid but mutually meaningless.
    """
    if not settings.embedding_worker_url.strip():
        raise ValueError(
            "EMBEDDING_PROVIDER=cloudflare requires EMBEDDING_WORKER_URL "
            "(the deployed Worker endpoint)."
        )
    if not settings.embedding_worker_api_key.strip():
        raise ValueError(
            "EMBEDDING_PROVIDER=cloudflare requires EMBEDDING_WORKER_API_KEY; "
            "set it in apps/ai-service/.env."
        )
    return CloudflareWorkerEmbeddings()


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    """Resolve the configured embedding provider.

    Ollama is the default so development and tests need no cloud credentials.
    Switching models always requires a new ``EMBEDDING_CONFIG_VERSION``, a new
    collection and a full re-index, because vectors from different models must
    never be mixed -- and a same-dimension swap is not caught by the
    dimension check in ``ensure_collection``.
    """
    provider = settings.embedding_provider.strip().lower()
    if provider == "ollama":
        return _ollama_embeddings()
    if provider in {"cloudflare", "cloudflare-worker"}:
        return _cloudflare_embeddings()

    raise ValueError(
        f"Unsupported embedding provider: {settings.embedding_provider!r}. "
        "Supported providers: ollama, cloudflare."
    )
