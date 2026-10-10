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
    gemini_model: str = "gemini-1.5-flash"
    gemini_temperature: float = 0.7
    gemini_max_tokens: int = 2048

    service_api_key: str = "dev-secret-key"

    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()