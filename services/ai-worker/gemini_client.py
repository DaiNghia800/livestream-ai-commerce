"""
Gemini AI client for parsing complex purchase intents.

Handles:
  - API key loading from environment
  - Prompt engineering for Vietnamese livestream comments
  - Response parsing (JSON from AI → Python dict)
  - Rate limiting (respect Gemini free tier: 15 RPM)
  - Retry with exponential backoff on transient errors
  - Graceful fallback when API is unavailable
"""

import json
import os
import time
import logging

from dotenv import load_dotenv
from google import genai
from typing import cast
from pydantic import BaseModel, Field

# Load environment variables from .env file
load_dotenv()

# ── Configuration ────────────────────────────────────────────

GEMINI_MODEL = "gemini-3.8-flash"

# Free tier: 15 requests per minute → 1 request every 4 seconds
RATE_LIMIT_INTERVAL = 4.0  # seconds between requests

# Retry config for transient errors (network, 503, etc.)
MAX_RETRIES = 2
RETRY_BASE_DELAY = 2.0  # seconds, doubles each retry

logger = logging.getLogger(__name__)

# ── Rate limiter (simple token bucket) ───────────────────────

_last_request_time = 0.0


def _wait_for_rate_limit():
    """Block until enough time has passed since the last request."""
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < RATE_LIMIT_INTERVAL:
        wait = RATE_LIMIT_INTERVAL - elapsed
        logger.debug(f"Rate limit: waiting {wait:.1f}s")
        time.sleep(wait)
    _last_request_time = time.time()


# ── Schema ───────────────────────────────────────────────────

class PurchaseIntentSchema(BaseModel):
    has_intent: bool = Field(description="True if the comment expresses intent to buy")
    product_code: str | None = Field(None, description="The product code if found, else null")
    color: str | None = Field(None, description="The color if found, else null")
    size: str | None = Field(None, description="The size if found, else null")
    quantity: int | None = Field(None, description="The quantity if found, else null")

# ── Prompt ───────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a purchase intent parser for a Vietnamese livestream commerce platform.

Given a viewer's comment, extract the purchase intent and return ONLY valid JSON:
{
  "has_intent": true/false,
  "product_code": "string or null",
  "color": "string or null",
  "size": "string or null",
  "quantity": number or null
}

Rules:
- Product codes look like: A12, SP-05, B7, SKU-123
- Colors are in Vietnamese: đen, trắng, đỏ, xanh, hồng, vàng, etc.
- Sizes: S, M, L, XL, XXL, etc.
- Quantity: look for numbers with units like "cái", "chiếc", "bộ"
- If the comment is just chatting (e.g. "Đẹp quá"), set has_intent to false
- Return ONLY the JSON object, no explanation, no markdown
"""


def _build_user_prompt(content: str) -> str:
    """Build the user message for Gemini."""
    return f'Parse this Vietnamese livestream comment:\n"{content}"'


# ── Client initialization ────────────────────────────────────

_client = None


def _get_client() -> genai.Client:
    """Lazy-init the Gemini client using GEMINI_API_KEY from env."""
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY not set. "
                "Get one at https://aistudio.google.com/app/apikey"
            )
        _client = genai.Client(api_key=api_key)
    return _client


# ── Core function ────────────────────────────────────────────

def parse_with_gemini(content: str) -> dict | None:
    """
    Send a comment to Gemini AI and parse the purchase intent.

    Args:
        content: The validated, stripped comment text.

    Returns:
        A dict with has_intent, product_code, color, size, quantity
        or None if the API call fails after all retries.
    """
    client = _get_client()
    user_prompt = _build_user_prompt(content)

    for attempt in range(MAX_RETRIES + 1):
        try:
            _wait_for_rate_limit()

            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=user_prompt,
                config=genai.types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.1,  # Low temperature = more deterministic
                    response_mime_type="application/json",
                    response_schema=PurchaseIntentSchema,
                ),
            )

            # Gemini SDK parsed it automatically into our Pydantic schema
            result = cast(PurchaseIntentSchema, response.parsed)

            if not result:
                return None

            # Validate the response has expected fields
            return {
                "has_intent": result.has_intent,
                "product_code": result.product_code,
                "color": result.color,
                "size": result.size,
                "quantity": result.quantity,
            }

        except json.JSONDecodeError as e:
            logger.warning(f"Gemini returned invalid JSON: {e}")
            return None  # Don't retry on bad JSON — prompt issue

        except EnvironmentError:
            raise  # Don't retry missing API key

        except Exception as e:
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    f"Gemini API error (attempt {attempt + 1}/"
                    f"{MAX_RETRIES + 1}): {e}. "
                    f"Retrying in {delay}s..."
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"Gemini API failed after {MAX_RETRIES + 1} attempts: {e}"
                )
                return None
