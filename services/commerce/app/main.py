from datetime import UTC, datetime, timedelta

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import ensure_auth_tables, get_connection
from .schemas import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from .security import create_access_token, create_refresh_token, hash_password, verify_password

settings = get_settings()
app = FastAPI(title="LiveOrder Commerce API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_auth_tables()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, connection=Depends(get_connection)) -> AuthResponse:
    email = payload.email.lower()
    try:
        user = connection.execute(
            """
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES (%s, %s, %s, 'shop_owner')
            RETURNING id, email, full_name, role
            """,
            (email, hash_password(payload.password), payload.full_name),
        ).fetchone()
        refresh_token = create_refresh_token(user["id"], user["role"])
        expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
        connection.execute(
            """
            INSERT INTO user_sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user["id"], refresh_token, request.headers.get("user-agent"), request.client.host if request.client else None, expires_at),
        )
        connection.commit()
    except psycopg.errors.UniqueViolation:
        connection.rollback()
        raise HTTPException(status_code=409, detail="Email đã được sử dụng") from None

    return _auth_response(user, refresh_token)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, connection=Depends(get_connection)) -> AuthResponse:
    user = connection.execute(
        """
        SELECT id, email, full_name, role, password_hash
        FROM users
        WHERE email = %s AND is_active = TRUE
        """,
        (payload.email.lower(),),
    ).fetchone()
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")

    refresh_token = create_refresh_token(user["id"], user["role"])
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
    connection.execute(
        """
        INSERT INTO user_sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (user["id"], refresh_token, request.headers.get("user-agent"), request.client.host if request.client else None, expires_at),
    )
    connection.commit()
    return _auth_response(user, refresh_token)


def _auth_response(user: dict, refresh_token: str) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user["id"], user["role"]),
        refresh_token=refresh_token,
        user=UserResponse(
            id=user["id"], email=user["email"], full_name=user["full_name"], role=user["role"]
        ),
    )
