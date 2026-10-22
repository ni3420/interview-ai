import pytest
from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings

from app.core.config import settings
from app.services import embeddings


@pytest.fixture(autouse=True)
def _clear_cache():
    embeddings.get_embeddings.cache_clear()
    yield
    embeddings.get_embeddings.cache_clear()


def test_development_provider_uses_local_ollama_nomic(monkeypatch):
    monkeypatch.setattr(settings, "embedding_provider", "ollama")
    monkeypatch.setattr(settings, "embedding_model", "nomic-embed-text")

    vector = embeddings.get_embeddings()

    assert isinstance(vector, Embeddings)
    assert isinstance(vector, OllamaEmbeddings)
    assert vector.model == "nomic-embed-text"


def test_provider_name_is_normalized(monkeypatch):
    monkeypatch.setattr(settings, "embedding_provider", "  OLLAMA ")

    assert isinstance(embeddings.get_embeddings(), OllamaEmbeddings)


def test_unsupported_provider_fails_fast(monkeypatch):
    monkeypatch.setattr(settings, "embedding_provider", "gemini")

    with pytest.raises(ValueError, match="Unsupported embedding provider"):
        embeddings.get_embeddings()
