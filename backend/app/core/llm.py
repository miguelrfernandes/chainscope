from langchain_openai import ChatOpenAI

from app.core.config import get_settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_llm(temperature: float = 0.0, max_tokens: int | None = None) -> ChatOpenAI:
    settings = get_settings()
    return ChatOpenAI(
        model=settings.openrouter_model,
        base_url=OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
        temperature=temperature,
        max_tokens=max_tokens or settings.openrouter_max_tokens,
    )
