from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.health import router as health_router


def test_health_returns_ok():
    app = FastAPI()
    app.include_router(health_router)
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
