from functools import lru_cache

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings

from app.core.config import settings


def _ollama_embeddings() -> OllamaEmbeddings:
    """Local Ollama embeddings (development default: nomic-embed-text, 768-d)."""
    return OllamaEmbeddings(
        model=settings.embedding_model,
        base_url=settings.ollama_base_url,
    )


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    """Resolve the configured embedding provider.

    Development runs entirely locally through Ollama, so no cloud key is
    needed. Remote providers can be added here later; switching models always
    requires a new ``EMBEDDING_CONFIG_VERSION`` and a full re-index, because
    vectors from different models must never be mixed.
    """
    provider = settings.embedding_provider.strip().lower()
    if provider == "ollama":
        return _ollama_embeddings()

    raise ValueError(
        f"Unsupported embedding provider: {settings.embedding_provider!r}. "
        "Supported providers: ollama."
    )
