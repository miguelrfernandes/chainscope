"""Shared LangSmith env bootstrap for the eval scripts.

pydantic-settings reads backend/.env into Settings() fields without exporting them to
os.environ, but the langsmith SDK (Client, aevaluate) reads its config straight from
os.environ - so scripts here must copy the values across explicitly. This is deliberately
separate from app.core.langsmith.configure_langsmith(), which additionally gates on
langchain_tracing_v2 (a live-tracing toggle unrelated to whether dataset/eval calls can
authenticate).
"""

import os
import sys

from app.core.config import get_settings


def ensure_langsmith_env() -> None:
    settings = get_settings()
    if not settings.langchain_api_key:
        sys.exit(
            "LANGCHAIN_API_KEY is not set. Add it to backend/.env (get one from "
            "https://smith.langchain.com/settings) before running evals."
        )
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
