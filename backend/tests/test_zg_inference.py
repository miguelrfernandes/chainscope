import pytest
from app.core.config import get_settings
from app.core.llm import get_llm


@pytest.mark.skip(
    reason="Live integration test requiring valid ZG_API_KEY. Excluded from standard CI runs."
)
def test_zg_inference_live(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "0g")
    get_settings.cache_clear()

    settings = get_settings()
    if not settings.zg_api_key:
        pytest.skip("ZG_API_KEY is not configured")

    llm = get_llm(temperature=0.0, max_tokens=10)
    res = llm.invoke("Ping")
    assert res.content
    get_settings.cache_clear()
