from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_SERVICE_API_KEY = "dev-secret-key"


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

    # Token prices in USD per 1M tokens, used only to estimate model cost in
    # usage logs. There is no default: pricing changes, so an unset value
    # yields ``estimatedCostUsd: null`` instead of an invented number. Local
    # Ollama calls are reported as 0.
    gemini_input_price_per_1m: float | None = None
    gemini_output_price_per_1m: float | None = None

    # TokenHarbor exposes an OpenAI-compatible /chat/completions endpoint.
    # The free DeepSeek model is the default chat provider; configure a key
    # here or in the process environment.
    tokenharbor_api_key: str = ""
    tokenharbor_base_url: str = "https://tokenharbor.ai/v1"
    tokenharbor_model: str = "deepseek-v4.1-flash:free"
    tokenharbor_temperature: float = 0.7
    # DeepSeek reasons before answering and both phases share this budget.
    # 2048 could be consumed by reasoning alone, returning empty content, so
    # leave room for the reasoning phase plus the actual answer.
    tokenharbor_max_tokens: int = 8192
    tokenharbor_timeout_seconds: float = 120.0
    # Optional USD per 1M tokens for usage-log cost estimates. Leave unset
    # (or 0 for a free model) rather than inventing a price.
    tokenharbor_input_price_per_1m: float | None = None
    tokenharbor_output_price_per_1m: float | None = None

    # Provider selection. Names must be registered in app.ai.providers.
    # "gemini" is the optional remote provider; "ollama" uses local inference;
    # "tokenharbor" is the OpenAI-compatible DeepSeek endpoint above.
    ai_provider: str = "tokenharbor"
    # When the primary provider is unavailable (quota, 5xx, timeout) and this
    # fallback is actually reachable, continue on it. Set to an empty string
    # to disable the fallback in specific mode.
    ai_fallback_provider: str = ""
    # specific = AI_PROVIDER (+ optional fallback)
    # any      = first configured, healthy provider from the candidate order
    # all      = every configured provider; normalized results are batched
    ai_provider_mode: Literal["specific", "any", "all"] = "specific"
    # Comma-separated candidate order for any/all. Empty means every
    # registered provider in registration order (primary first).
    ai_provider_order: str = ""
    # Bound each provider call in any/all routing. 0 keeps each adapter's own
    # timeout (Ollama's local inference budget is intentionally large).
    ai_provider_timeout_seconds: float = 0.0
    # Cache health probes so any-mode requests do not re-probe on every call.
    ai_health_check_ttl_seconds: float = 30.0
    ai_health_check_timeout_seconds: float = 3.0
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

    # Required. There is deliberately no default secret: the service refuses
    # to start without one, so an unconfigured deployment cannot accept
    # unauthenticated calls.
    service_api_key: str = ""

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

    @model_validator(mode="after")
    def _validate_service_api_key(self) -> "Settings":
        if not self.service_api_key.strip():
            raise ValueError(
                "SERVICE_API_KEY is required; refusing to start without "
                "service authentication. Generate one with: openssl rand -hex 32"
            )
        if (
            self.app_env not in {"development", "test"}
            and self.service_api_key == DEVELOPMENT_SERVICE_API_KEY
        ):
            raise ValueError(
                "SERVICE_API_KEY must not use the development default outside "
                "development. Set a unique secret for this environment."
            )
        return self


settings = Settings()
