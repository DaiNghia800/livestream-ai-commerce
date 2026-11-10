"""
Gemini AI client for parsing complex purchase intents.

Handles:
  - API key loading from environment
  - Prompt engineering for Vietnamese livestream comments
  - Response parsing (JSON from AI → Python dict)
  - Rate limiting (respect Gemini free tier: 15 RPM)
  - Retry with exponential backoff on transient errors
  - Typed failures propagated to the event processor
"""

import json
import os
import time
import logging

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from typing import Any
import httpx
import pydantic

from ai_errors import AIParsingError

# Load environment variables from .env file
load_dotenv()

# ── Configuration ────────────────────────────────────────────

GEMINI_MODEL = "gemini-3.8-flash"

# Free tier: 15 requests per minute → 1 request every 4 seconds
RATE_LIMIT_INTERVAL = 4.0  # seconds between requests

# Retry config for transient errors (network, 503, etc.)
MAX_RETRIES = 2
RETRY_BASE_DELAY = 2.0  # seconds, doubles each retry

# SDK timeout uses milliseconds; the retry budget uses monotonic seconds.
HTTP_TIMEOUT_MS = 10_000
TOTAL_RETRY_BUDGET = 30.0
# This budget is cooperative: HTTPX timeouts bound network phases, not total
# wall-clock execution. A future Lambda adapter must also reserve deadline time.

logger = logging.getLogger(__name__)


def _configured_retries() -> int:
    """Allow a smaller operational retry limit without changing the default."""
    value = os.environ.get("GEMINI_MAX_RETRIES")
    if value is None:
        return MAX_RETRIES
    if value not in ("0", "1", "2"):
        raise AIParsingError("ai_configuration", "GEMINI_MAX_RETRIES must be 0, 1 or 2")
    return int(value)

# ── Rate limiter (simple token bucket) ───────────────────────

_last_request_time: float = 0.0


def _wait_for_rate_limit(deadline: float | None = None):
    """Wait for this process's request interval without exhausting its budget."""
    global _last_request_time
    now = time.monotonic()
    elapsed = now - _last_request_time
    if elapsed < RATE_LIMIT_INTERVAL:
        wait = RATE_LIMIT_INTERVAL - elapsed
        if deadline is not None and wait >= deadline - now:
            raise AIParsingError("ai_timeout", "Gemini retry budget exhausted")
        logger.debug(f"Rate limit: waiting {wait:.1f}s")
        time.sleep(wait)
    _last_request_time = time.monotonic()


def _request_timeout_ms(deadline: float) -> int:
    """Round down the remaining budget; zero must never disable SDK timeouts."""
    timeout = min(HTTP_TIMEOUT_MS, int((deadline - time.monotonic()) * 1000))
    if timeout <= 0:
        raise AIParsingError("ai_timeout", "Gemini retry budget exhausted")
    return timeout


# ── Schema & prompt (shared with every provider) ─────────────

# Giữ tên cũ để openai_client và test import được như trước.
from ai_prompt import (  # noqa: E402
    PurchaseIntentSchema,
    SYSTEM_PROMPT,
    build_user_prompt as _build_user_prompt,
    to_result as _to_result,
)


# ── Client initialization ────────────────────────────────────

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Lazy-init the Gemini client using GEMINI_API_KEY from env."""
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise AIParsingError(
                "ai_configuration",
                "GEMINI_API_KEY not set. Get one at https://aistudio.google.com/app/apikey"
            )
        _client = genai.Client(
            api_key=api_key,
            http_options=genai.types.HttpOptions(
                timeout=HTTP_TIMEOUT_MS,
                client_args={"follow_redirects": False},
                retry_options=genai.types.HttpRetryOptions(attempts=1),
            ),
        )
    return _client


# ── Core function ────────────────────────────────────────────

def parse_with_gemini(content: str, catalogue: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """
    Send a comment to Gemini AI and parse the purchase intent.

    Module constants configure at most three attempts, 10,000 ms per request,
    and a cooperative 30-second budget including setup, rate limiting and
    backoff. Blocking HTTP phases can overshoot this budget; it is not a strict
    wall-clock guarantee or a substitute for a future Lambda deadline check.
    GEMINI_MAX_RETRIES can select 0, 1 or 2 retries; the normal default is 2.

    Args:
        content: The validated, stripped comment text.
        catalogue: Products of the livestream (code, SKU, name, variant) so the
                   AI can map names to codes. Empty when unavailable.

    Returns:
        A dict with has_intent, product_code, color, size, quantity.

    Raises:
        AIParsingError: if AI call fails after retries, config is missing,
                        or schema validation fails.
    """
    deadline = time.monotonic() + TOTAL_RETRY_BUDGET
    max_retries = _configured_retries()
    client = _get_client()
    user_prompt = _build_user_prompt(content, catalogue)

    # Build local configuration outside the remote-error boundary.
    config = genai.types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=0.1,
        response_mime_type="application/json",
        response_schema=PurchaseIntentSchema,
    )
    for attempt in range(max_retries + 1):
        try:
            _request_timeout_ms(deadline)
            _wait_for_rate_limit(deadline)
            request_config = config.model_copy(update={
                "http_options": genai.types.HttpOptions(
                    timeout=_request_timeout_ms(deadline),
                    retry_options=genai.types.HttpRetryOptions(attempts=1),
                ),
            })

            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=user_prompt,
                config=request_config,
            )

            _request_timeout_ms(deadline)

            result = response.parsed
            if not isinstance(result, PurchaseIntentSchema):
                raise AIParsingError("ai_invalid_response", "AI returned invalid structured output")

            return _to_result(result)

        except pydantic.ValidationError as e:
            raise AIParsingError("ai_invalid_response", "AI returned invalid schema") from e
        except json.JSONDecodeError as e:
            raise AIParsingError("ai_invalid_response", "AI returned invalid JSON") from e
        except (genai_errors.APIError, httpx.TimeoutException,
                httpx.NetworkError, httpx.RemoteProtocolError) as e:
            if isinstance(e, genai_errors.APIError):
                # SDK code is numeric; status is a string such as UNAVAILABLE.
                if e.code in (401, 403):
                    raise AIParsingError("ai_authentication", "Gemini authentication failed") from e
                if e.code == 429:
                    error_type = "ai_rate_limit"
                elif e.code == 408 or 500 <= e.code < 600:
                    error_type = "ai_transient"
                else:
                    raise AIParsingError(
                        "ai_configuration", f"Gemini rejected request (HTTP {e.code})"
                    ) from e
            elif isinstance(e, httpx.TimeoutException):
                error_type = "ai_timeout"
            else:
                error_type = "ai_network"

            if attempt == max_retries:
                raise AIParsingError(error_type, "Gemini request failed after retries") from e
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            if delay >= deadline - time.monotonic():
                raise AIParsingError(error_type, "Gemini retry budget exhausted") from e
            logger.warning("Gemini %s; retry %s/%s in %ss",
                           error_type, attempt + 1, max_retries, delay)
            time.sleep(delay)

    raise AssertionError("Unreachable retry state")
