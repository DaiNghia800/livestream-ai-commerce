from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


engine = create_engine(
    get_settings().sqlalchemy_url,
    pool_pre_ping=True, # do connection chet sau khi postgres restart
    pool_size=10, # du cho luong req // luc chot don
    max_overflow=20,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

def get_session() -> Iterator[Session]:
    """Dependency của FastAPI: mỗi request một session, tự đóng khi xong."""
    with SessionLocal() as session:
        yield session

def database_is_up() -> bool:
    """Ping nhẹ cho /health. Nuốt lỗi để health luôn trả lời được."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        return False
    return True

