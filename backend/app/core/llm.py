import contextvars

from langchain_openai import ChatOpenAI

from app.core.config import get_settings

OPENAI_PROVIDER = "openai"
OPENROUTER_PROVIDER = "openrouter"
CHAINSCOPE_PROVIDER = "chainscope"
ZERO_G_PROVIDER = "0g"

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
    effective_provider = llm_provider or _current_llm_provider.get() or settings.llm_provider
    if effective_provider == CHAINSCOPE_PROVIDER:
        effective_provider = OPENAI_PROVIDER

    tokens = max_tokens or settings.openrouter_max_tokens

    def _build_llm(
        *,
        provider: str,
        model: str,
        base_url: str,
        api_key: str | None,
    ):
        llm_kwargs = {
            "model": model,
            "base_url": base_url,
            "temperature": temperature,
            "max_tokens": tokens,
        }
        if api_key:
            llm_kwargs["api_key"] = api_key

        return ChatOpenAI(**llm_kwargs).with_config(
            tags=[f"llm_provider:{provider}"],
            metadata={"llm_provider": provider, "provider": provider},
        )

    def _openrouter_llm():
        return _build_llm(
            provider=OPENROUTER_PROVIDER,
            model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key,
        )

    if effective_provider == ZERO_G_PROVIDER:
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
            metadata={"llm_provider": ZERO_G_PROVIDER, "provider": ZERO_G_PROVIDER},
        )
        # Use 0G as primary with OpenRouter as automatic fallback if 0G errors or times out
        return zg_llm.with_fallbacks([_openrouter_llm()])

    if effective_provider == OPENROUTER_PROVIDER:
        return _openrouter_llm()

    return _build_llm(
        provider=OPENAI_PROVIDER,
        model=settings.openai_model,
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
    )
