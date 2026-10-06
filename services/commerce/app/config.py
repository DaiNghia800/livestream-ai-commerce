from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf8",
        extra="ignore",
    )

    database_url: str = "postgresql://postgres:postgres@localhost:5432/commerce_db"

    # TTL giữ hàng 2 tầng — xem QĐ-1 trong docs/design/draft-order-reservation
    hold_soft_seconds: int = 300
    hold_confirm_seconds: int = 900
    hold_max_seconds: int = 1800

    @property
    def sqlalchemy_url(self) -> str:
        """SQLAlchemy 2 phải chỉ rõ driver psycopg 3.

        .env giữ dạng chuẩn `postgresql://` để psql và pgAdmin dùng chung
        được, nên đổi scheme tại đây thay vì bắt cả nhóm sửa .env.
        """
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url

@lru_cache
def get_settings() -> Settings:
    return Settings()