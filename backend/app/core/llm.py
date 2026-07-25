import contextvars
from langchain_openai import ChatOpenAI

from app.core.config import get_settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_current_llm_provider: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_llm_provider", default=None
)


def set_llm_provider(provider: str | None) -> contextvars.Token:
    return _current_llm_provider.set(provider)


def reset_llm_provider(token: contextvars.Token) -> None:
    _current_llm_provider.reset(token)


def get_llm(
    temperature: float = 0.0,
    max_tokens: int | None = None,
    llm_provider: str | None = None,
):
    settings = get_settings()
    effective_provider = (
        llm_provider or _current_llm_provider.get() or settings.llm_provider
    )
    if effective_provider == "chainscope":
        effective_provider = "openrouter"

    tokens = max_tokens or settings.openrouter_max_tokens

    openrouter_llm = ChatOpenAI(
        model=settings.openrouter_model,
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
        temperature=temperature,
        max_tokens=tokens,
    ).with_config(
        tags=["llm_provider:openrouter"],
        metadata={"llm_provider": "openrouter", "provider": "openrouter"},
    )

    if effective_provider == "0g":
        # 0G Compute Router: an OpenAI-compatible gateway in front of the 0G
        # Compute Network's decentralized, TEE-verified inference providers.
        zg_llm = ChatOpenAI(
            model=settings.zg_model,
            base_url=settings.zg_base_url,
            api_key=settings.zg_api_key,
            temperature=temperature,
            max_tokens=tokens,
        ).with_config(
            tags=["llm_provider:0g"],
            metadata={"llm_provider": "0g", "provider": "0g"},
        )
        # Use 0G as primary with OpenRouter as automatic fallback if 0G errors or times out
        return zg_llm.with_fallbacks([openrouter_llm])

    return openrouter_llm

