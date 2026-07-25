from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_max_tokens: int = 1500

    # LLM provider switch: "openrouter" (default) or "0g" (0G Compute Router —
    # OpenAI-compatible, TEE-verified decentralized inference). Both are
    # ChatOpenAI under a different base_url/api_key, so swapping is a
    # config-only change — see app/core/llm.py.
    llm_provider: str = "openrouter"
    zg_api_key: str | None = None
    zg_base_url: str = "https://router-api-testnet.integratenetwork.work/v1"
    zg_model: str = "qwen2.5-omni"

    langchain_tracing_v2: bool = False
    langchain_api_key: str | None = None
    langchain_project: str = "chainscope-dev"
    langchain_endpoint: str = "https://api.smith.langchain.com"

    graph_mcp_url: str
    graph_api_key: str | None = None

    pinax_api_token: str | None = None
    pinax_api_base_url: str = "https://api.pinax.network"

    # Public Sepolia RPC used for read-only eth_call balance checks (no key
    # needed) — see app/tools/aave_actions.py. The user's own wallet signs
    # and broadcasts the actual transactions.
    sepolia_rpc_url: str = "https://ethereum-sepolia-rpc.publicnode.com"

    cors_origins: str = "http://localhost:3000"
    sandbox_timeout_seconds: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
