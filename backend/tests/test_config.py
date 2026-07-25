from app.core.config import get_settings


def test_cors_origin_list_splits_and_trims(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example.com, https://b.example.com")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.cors_origin_list == ["https://a.example.com", "https://b.example.com"]
    get_settings.cache_clear()
