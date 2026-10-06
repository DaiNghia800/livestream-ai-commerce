"""Smoke test Commerce Service.

Chỉ kiểm tra app dựng được và /health đúng hình dạng — cố ý KHÔNG cần
Postgres, để chạy được cả khi chưa bật docker compose.
"""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

def test_health_always_200():
    assert client.get("/health").status_code == 200

def test_health_correct_form():
    body = client.get("/health").json()
    assert body["service"] == "commerce"
    assert body["status"] in {"ok", "degraded"}
    assert body["database"] in {"up", "down"}