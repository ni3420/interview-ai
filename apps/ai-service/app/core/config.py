from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Interview AI Service"
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    gemini_temperature: float = 0.7
    gemini_max_tokens: int = 2048

    service_api_key: str = "dev-secret-key"

    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Resume processing / vector retrieval ---------------------------------
    # Embeddings are produced locally by Ollama and stored in Qdrant through
    # LangChain. The model + dimension are part of the stored metadata so that
    # vectors from incompatible models are never mixed.
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    embedding_dimension: int = 768
    embedding_config_version: str = "v1"

    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "resume_chunks"

    # Bounded resume handling.
    resume_max_bytes: int = 5 * 1024 * 1024
    chunk_size: int = 1000
    chunk_overlap: int = 150


settings = Settings()
