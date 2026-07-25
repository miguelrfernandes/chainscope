import os

from app.core.config import get_settings


def configure_langsmith() -> None:
    settings = get_settings()
    if not settings.langchain_tracing_v2 or not settings.langchain_api_key:
        return
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
