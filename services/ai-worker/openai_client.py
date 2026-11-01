"""
openai_client.py — Parse purchase intent with the OpenAI API.

Same contract as gemini_client.parse_with_gemini: one comment in, one dict
with has_intent / product_code / color / size / quantity out, and every
failure surfaces as AIParsingError with the same error_type values so the
SQS worker treats both providers identically.
"""

import logging
import os
import time
from typing import Any

import pydantic
from dotenv import load_dotenv
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    ContentFilterFinishReasonError,
    InternalServerError,
    LengthFinishReasonError,
    OpenAI,
    PermissionDeniedError,
    RateLimitError,
)

from ai_errors import AIParsingError
# Dùng chung prompt và schema với Gemini để hai nhà cung cấp không lệch nhau.
from ai_prompt import SYSTEM_PROMPT, PurchaseIntentSchema, build_user_prompt, to_result

# Nạp .env gốc của dự án (OPENAI_API_KEY, OPENAI_MODEL).
load_dotenv()

# ── Configuration ────────────────────────────────────────────

# Model rẻ, hỗ trợ structured output; đổi bằng OPENAI_MODEL trong .env.
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"

# Tài khoản trả trước không bị giới hạn 15 lượt/phút như Gemini miễn phí,
# chỉ giãn nhẹ để một phiên live đông bình luận không dội thẳng vào API.
RATE_LIMIT_INTERVAL = 0.2  # seconds between requests

# Thử lại cho lỗi tạm thời (mạng, 5xx, 429), giống gemini_client.
MAX_RETRIES = 2
RETRY_BASE_DELAY = 2.0  # seconds, doubles each retry

# Thời gian chờ tối đa một lượt gọi; bình luận ngắn nên không cần lâu.
REQUEST_TIMEOUT_SECONDS = 20.0

logger = logging.getLogger(__name__)

# ── Rate limiter ─────────────────────────────────────────────

_last_request_time: float = 0.0


def _wait_for_rate_limit() -> None:
    """Block until enough time has passed since the last request."""
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_INTERVAL:
        time.sleep(RATE_LIMIT_INTERVAL - elapsed)
    _last_request_time = time.time()


# ── Client initialization ────────────────────────────────────

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    """Lazy-init the OpenAI client using OPENAI_API_KEY from env."""
    global _client
    if _client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise AIParsingError(
                "ai_configuration",
                "OPENAI_API_KEY not set. Get one at https://platform.openai.com/api-keys",
            )
        # max_retries=0: tự thử lại ở dưới để log và đếm lượt giống Gemini.
        _client = OpenAI(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=0)
    return _client


def _model_name() -> str:
    """Model from OPENAI_MODEL, falling back to the default."""
    return os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL


def _supports_temperature(model: str) -> bool:
    """Reasoning models (o-series, gpt-5 family) reject a custom temperature."""
    name = model.lower()
    return not (name.startswith("o") or name.startswith("gpt-5"))


# ── Core function ────────────────────────────────────────────

def parse_with_openai(content: str, catalogue: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """
    Send a comment to OpenAI and parse the purchase intent.

    Args:
        content: The validated, stripped comment text.
        catalogue: Products of the livestream (code, SKU, name, variant) so the
                   AI can map names to codes. Empty when unavailable.

    Returns:
        A dict with has_intent, product_code, color, size, quantity.

    Raises:
        AIParsingError: if the call fails after retries, config is missing,
                        or the response does not match the schema.
    """
    client = _get_client()
    model = _model_name()
    request: dict[str, Any] = {
        "model": model,
        "instructions": SYSTEM_PROMPT,
        "input": build_user_prompt(content, catalogue),
        "text_format": PurchaseIntentSchema,
    }
    if _supports_temperature(model):
        request["temperature"] = 0.1

    for attempt in range(MAX_RETRIES + 1):
        try:
            _wait_for_rate_limit()
            response = client.responses.parse(**request)
            result = response.output_parsed
            if not isinstance(result, PurchaseIntentSchema):
                raise AIParsingError("ai_invalid_response", "AI returned invalid structured output")
            return to_result(result)

        except pydantic.ValidationError as e:
            raise AIParsingError("ai_invalid_response", "AI returned invalid schema") from e
        except (LengthFinishReasonError, ContentFilterFinishReasonError) as e:
            raise AIParsingError("ai_invalid_response", "AI did not return a complete answer") from e
        except (AuthenticationError, PermissionDeniedError) as e:
            # Sai key / không có quyền: thử lại vô ích.
            raise AIParsingError("ai_authentication", "OpenAI authentication failed") from e
        except (RateLimitError, InternalServerError, APITimeoutError,
                APIConnectionError, APIStatusError) as e:
            if isinstance(e, RateLimitError):
                error_type = "ai_rate_limit"
            elif isinstance(e, InternalServerError):
                error_type = "ai_transient"
            elif isinstance(e, APITimeoutError):
                # Phải xét trước APIConnectionError vì là lớp con của nó.
                error_type = "ai_timeout"
            elif isinstance(e, APIConnectionError):
                error_type = "ai_network"
            else:
                # 400/404/422…: model sai tên, tham số không hợp lệ. Cấu hình
                # sai thì gửi lại cũng vậy.
                raise AIParsingError(
                    "ai_configuration", f"OpenAI rejected request (HTTP {e.status_code})"
                ) from e

            if attempt == MAX_RETRIES:
                raise AIParsingError(error_type, "OpenAI request failed after retries") from e
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning("OpenAI %s; retry %s/%s in %ss",
                           error_type, attempt + 1, MAX_RETRIES, delay)
            time.sleep(delay)

    raise AssertionError("Unreachable retry state")
