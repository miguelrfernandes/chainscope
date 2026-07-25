from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str
    openrouter_model: str = "anthropic/claude-sonnet-4.5"
    openrouter_max_tokens: int = 1500

    langchain_tracing_v2: bool = False
    langchain_api_key: str | None = None
    langchain_project: str = "chainscope-dev"

    graph_mcp_url: str
    graph_api_key: str | None = None

    pinax_api_token: str | None = None
    pinax_api_base_url: str = "https://api.pinax.network"

    cors_origins: str = "http://localhost:3000"
    sandbox_timeout_seconds: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
