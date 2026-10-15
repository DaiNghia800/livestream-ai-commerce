from collections.abc import Generator

import psycopg
from psycopg.rows import dict_row

from .config import get_settings


CREATE_AUTH_TABLES = """
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'shop_owner',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(2048) NOT NULL UNIQUE,
    user_agent VARCHAR(255),
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
"""


def get_connection() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(get_settings().database_url, row_factory=dict_row) as connection:
        yield connection


def ensure_auth_tables() -> None:
    with psycopg.connect(get_settings().database_url) as connection:
        connection.execute(CREATE_AUTH_TABLES)
        connection.commit()
