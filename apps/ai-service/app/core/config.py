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

    # Model provider selection. "gemini" is the optional remote provider;
    # "ollama" uses local inference so the service works without cloud keys.
    ai_provider: str = "gemini"
    # When the primary provider is unavailable (quota, 5xx, timeout) and this
    # local provider has the configured model installed, continue on it.
    # Set to an empty string to disable the fallback.
    ai_fallback_provider: str = "ollama"
    ollama_model: str = "llama3.2:1b"
    ollama_temperature: float = 0.7
    # Bound generation so slow local CPU inference still completes in time.
    # Local CPU inference can take minutes; the HTTP timeout must exceed it.
    ollama_max_tokens: int = 512
    ollama_timeout_seconds: float = 900.0

    # --- Interview report rubric ---------------------------------------------
    # Optional percentage overrides for the rubric in ``app.core.rubric``. The
    # resolved weights must sum to 100 or the report endpoint refuses to run.
    report_rubric_weights: dict[str, int] = {}
    # Grading is deterministic: temperature 0 plus a fixed seed where the
    # provider supports it.
    report_temperature: float = 0.0
    report_seed: int = 42
    # Bound the JSON response so a runaway model cannot exhaust the worker.
    report_max_tokens: int = 4096

    service_api_key: str = "dev-secret-key"

    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Resume processing / vector retrieval ---------------------------------
    # Embeddings are produced locally by Ollama and stored in Qdrant through
    # LangChain. The model + dimension are part of the stored metadata so that
    # vectors from incompatible models are never mixed.
    ollama_base_url: str = "http://localhost:11434"
    # Development uses local Ollama embeddings; no cloud key is required.
    # Adding a remote provider requires a new config version and a re-index.
    embedding_provider: str = "ollama"
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

    # --- Realtime vision agent ------------------------------------------------
    # The agent joins the interview's Stream call as a bot participant and runs
    # a speech-to-speech + vision model (Gemini Live by default). Stream
    # credentials are server-only and must never reach the browser.
    stream_api_key: str = ""
    stream_api_secret: str = ""
    realtime_model: str = "gemini-3.1-flash-live-preview"
    realtime_agent_user_id: str = "ai-interviewer"
    realtime_agent_user_name: str = "AI Interviewer"
    # Cap the grounded context injected into the agent's instructions.
    realtime_max_resume_chars: int = 6000
    realtime_max_questions: int = 25


settings = Settings()
