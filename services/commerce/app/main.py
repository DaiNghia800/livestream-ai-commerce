from fastapi import FastAPI

from app.db import database_is_up


app = FastAPI(
    title="LiveOrder Commerce API",
    version="0.1.0",
    description="Đơn hàng, giữ tồn kho và thanh toán phát sinh từ livestream.",
)

@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Luôn trả 200, kể cả khi DB chết.

    Cố ý không trả 503: cần phân biệt được "service chết" với
    "service sống nhưng mất DB" khi đọc log.
    """
    up = database_is_up()
    return {
        "service": "commerce",
        "status": "ok" if up else "degraded",
        "database": "up" if up else "down",
    }