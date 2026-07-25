import pytest

from app.core.config import get_settings

REQUIRED_ENV = {
    "OPENAI_API_KEY": "test-key",
    "OPENROUTER_API_KEY": "test-key",
    "GRAPH_MCP_URL": "https://example.invalid/sse",
    "AGENT_VAULT_ENCRYPTION_KEY": "test-agent-vault-encryption-key",
}


@pytest.fixture(autouse=True)
def _test_settings(monkeypatch):
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
