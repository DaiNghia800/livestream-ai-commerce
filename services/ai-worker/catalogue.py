"""
catalogue.py — Product list of a livestream, fetched from Commerce.

Commerce stays the source of truth; the worker only reads the public
endpoint GET /api/livestreams/{id}/products and keeps a short cache so a
busy session does not hit Commerce for every comment. Any failure yields an
empty list: the AI still runs, just without the name → code mapping.
"""

import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Danh mục của một phiên ít đổi; 60 s là đủ để shop thêm sản phẩm giữa live
# mà vẫn không gọi Commerce cho từng bình luận.
CACHE_TTL_SECONDS = 60.0
REQUEST_TIMEOUT_SECONDS = 3.0

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def commerce_api_url() -> str:
    """Base URL of Commerce, without trailing slash."""
    return (os.environ.get("COMMERCE_API_URL") or "http://localhost:8000").rstrip("/")


def fetch_catalogue(session_id: str) -> list[dict[str, Any]]:
    """Products attached to the livestream, or [] when Commerce is unreachable."""
    now = time.time()
    cached = _cache.get(session_id)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    url = f"{commerce_api_url()}/api/livestreams/{session_id}/products"
    try:
        response = httpx.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json().get("data", [])
        items = [p for p in data if isinstance(p, dict)]
    except Exception as e:  # mạng, 4xx/5xx, JSON hỏng: AI vẫn chạy, chỉ thiếu danh mục
        logger.warning("Catalogue unavailable for %s (%s); AI runs without it", session_id, type(e).__name__)
        items = []

    _cache[session_id] = (now, items)
    return items


def clear_cache() -> None:
    """Forget every cached catalogue (tests)."""
    _cache.clear()
