from functools import lru_cache

from langchain_ollama import OllamaEmbeddings

from app.core.config import settings


@lru_cache(maxsize=1)
def get_embeddings() -> OllamaEmbeddings:
    """Local Ollama embeddings, created lazily.

    Kept lazy so the service (and deterministic unit tests) can be imported
    without a running Ollama instance.
    """
    return OllamaEmbeddings(
        model=settings.embedding_model,
        base_url=settings.ollama_base_url,
    )
