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

    # Public Hedera Mirror Node REST API (no key needed) — see
    # app/tools/hedera_mirror.py. Testnet by default; swap to
    # "https://mainnet.mirrornode.hedera.com" for mainnet data.
    hedera_mirror_node_base_url: str = "https://testnet.mirrornode.hedera.com"

    # Hedera Agent Kit action agent — a dedicated backend-held testnet
    # operator account (AUTONOMOUS mode: the backend signs and submits
    # directly, unlike the yield advisor where the user's own wallet signs).
    # Create a free funded testnet account at
    # https://portal.hedera.com/dashboard. Leave unset to disable the
    # action agent — the read-only Hedera specialist still works without it.
    hedera_operator_account_id: str | None = None
    hedera_operator_private_key: str | None = None
    hedera_network: str = "testnet"

    hedera_schedule_factory_address: str = "0x0000000000000000000000000000000000000000"
    hedera_native_transfer_strategy_address: str = "0x0000000000000000000000000000000000000000"

    # Symmetric key used to derive the AES-256-GCM key that encrypts managed
    # agents' Hedera private keys at rest (see app/tools/hedera_provisioner.py).
    # Required — there is deliberately no hardcoded fallback, since anyone
    # reading this repo would then be able to decrypt every stored key.
    # Generate one with `openssl rand -hex 32`.
    agent_vault_encryption_key: str

    # SaucerSwap public REST API (https://api.saucerswap.finance) — see
    # app/tools/saucerswap_actions.py. Defaults to the public demo key shown
    # in SaucerSwap's own docs (docs.saucerswap.finance/v/developer/rest-api);
    # request a real key from support@saucerswap.finance for production use.
    saucerswap_api_key: str = "875e1017-87b8-4b12-8301-6aa1f1aa073b"

    # Uniswap Trading API (https://docs.uniswap.org/api/trading-api/welcome) —
    # requires an API key from developer.uniswap.org. The exact base URL and auth
    # header name (x-api-key assumed) should be verified against docs.uniswap.org/api
    # during implementation since external docs cannot be fetched directly.
    uniswap_api_key: str | None = None
    uniswap_api_base_url: str = "https://trading-api-labs.interface.gateway.uniswap.org/v1"
    uniswap_default_chain_id: int = 1

    cors_origins: str = "http://localhost:3000"
    sandbox_timeout_seconds: int = 10

    # SQLite store for managed Hedera agent accounts (owner_address ->
    # agent_name -> account_id/encrypted key) — see app/core/agent_store.py.
    # Callers encrypt the private key before it reaches this store; this
    # setting only controls where the (already-encrypted) rows live on disk.
    managed_agent_db_path: str = "managed_agents.db"
    scheduler_db_path: str = "scheduler.db"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
