from langchain_openai import ChatOpenAI

from app.core.config import get_settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_llm(temperature: float = 0.0, max_tokens: int | None = None):
    settings = get_settings()
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

    if settings.llm_provider == "0g":
        # 0G Compute Router: an OpenAI-compatible gateway in front of the 0G
        # Compute Network's decentralized, TEE-verified inference providers.
        zg_llm = ChatOpenAI(
            model=settings.zg_model,
            base_url=settings.zg_base_url,
            api_key=settings.zg_api_key,
            temperature=temperature,
            max_tokens=tokens,
        ).with_config(tags=["llm_provider:0g"], metadata={"llm_provider": "0g", "provider": "0g"})
        # Use 0G as primary with OpenRouter as automatic fallback if 0G errors or times out
        return zg_llm.with_fallbacks([openrouter_llm])

    return openrouter_llm
