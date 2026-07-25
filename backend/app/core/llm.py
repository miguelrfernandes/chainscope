from langchain_openai import ChatOpenAI

from app.core.config import get_settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_llm(temperature: float = 0.0, max_tokens: int | None = None) -> ChatOpenAI:
    settings = get_settings()
    tokens = max_tokens or settings.openrouter_max_tokens

    if settings.llm_provider == "0g":
        # 0G Compute Router: an OpenAI-compatible gateway in front of the 0G
        # Compute Network's decentralized, TEE-verified inference providers.
        # Same ChatOpenAI client as OpenRouter — just a different
        # base_url/api_key/model, so this is a pure config swap.
        return ChatOpenAI(
            model=settings.zg_model,
            base_url=settings.zg_base_url,
            api_key=settings.zg_api_key,
            temperature=temperature,
            max_tokens=tokens,
        )

    return ChatOpenAI(
        model=settings.openrouter_model,
        base_url=OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
        temperature=temperature,
        max_tokens=tokens,
    )
