from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    allowed_source_hosts: str = ""
    source_fetch_timeout: int = 30
    source_max_response_mb: int = 50
    source_max_rows: int = 200_000

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_source_hosts_list(self) -> list[str]:
        return [h.strip().lower() for h in self.allowed_source_hosts.split(",") if h.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
