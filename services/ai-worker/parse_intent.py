"""
Parse purchase intent from a livestream comment.

Strategy (hybrid):
  1. Regex tries first — fast, free, no network
  2. If regex confidence is "high" → return immediately
  3. If regex confidence is "low"  → call Gemini AI to verify
  4. If Gemini fails              → fall back to regex result
  5. If no keywords found         → skip (no intent)
"""

import re
import logging

# --- Known values (will move to database/config later) ---
# Sorted longest-first so "xanh dương" matches before "xanh"
KNOWN_COLORS = [
    "xanh dương", "xanh lá",
    "đen", "trắng", "đỏ", "xanh", "hồng",
    "vàng", "nâu", "xám", "tím", "cam",
    "be", "kem",
]

KNOWN_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"]

# Strong keywords = clearly want to buy
# Weak keywords = might be buying, need more signals
STRONG_KEYWORDS = ["chốt", "mua", "order", "đặt"]
WEAK_KEYWORDS = ["lấy", "cho"]

logger = logging.getLogger(__name__)


def parse_purchase_intent(content: str, use_ai: bool = True) -> dict:
    """
    Extract purchase intent from a comment string.

    Args:
        content: The validated, stripped comment text.
        use_ai: If True, call Gemini AI when regex confidence is low.
                Set to False in tests to avoid real API calls.

    Returns:
        A dict with:
          - "has_intent": True if this looks like a purchase comment
          - "confidence": "high" | "low" | None
          - "source": "regex" | "gemini" — who made the final decision
          - "product_code": str or None
          - "color": str or None
          - "size": str or None
          - "quantity": int or None
          - "raw": the original content (for debugging)
    """
    # --- Step 1: Regex tries first (fast, free) ---
    regex_result = _regex_parse(content)

    # No keywords found → definitely not buying
    if not regex_result["has_intent"]:
        return regex_result

    # Regex is confident → trust it, skip AI
    if regex_result["confidence"] == "high":
        return regex_result

    # --- Step 2: Regex confidence is "low" → ask Gemini AI ---
    if not use_ai:
        return regex_result

    logger.info(f"Low confidence, calling Gemini AI for: {content}")
    ai_result = _try_gemini(content)

    if ai_result is not None:
        return ai_result

    # --- Step 3: Gemini failed → fall back to regex ---
    logger.warning("Gemini failed, falling back to regex result")
    return regex_result


# ── Regex parser ─────────────────────────────────────────────


def _regex_parse(content: str) -> dict:
    """Pure regex-based parsing. No network, no side effects."""
    lower = content.lower()

    has_strong = any(kw in lower for kw in STRONG_KEYWORDS)
    has_weak = any(kw in lower for kw in WEAK_KEYWORDS)

    if not has_strong and not has_weak:
        return _no_intent(content, source="regex")

    product_code = _extract_product_code(content)
    color = _extract_color(lower)
    size = _extract_size(content)
    quantity = _extract_quantity(content, lower, product_code)

    fields_found = sum([
        product_code is not None,
        color is not None,
        size is not None,
        quantity is not None,
    ])

    if has_strong and fields_found >= 2:
        confidence = "high"
    elif has_strong or fields_found >= 1:
        confidence = "low"
    else:
        return _no_intent(content, source="regex")

    return {
        "has_intent": True,
        "confidence": confidence,
        "source": "regex",
        "product_code": product_code,
        "color": color,
        "size": size,
        "quantity": quantity,
        "raw": content,
    }


# ── Gemini AI caller ─────────────────────────────────────────


def _try_gemini(content: str) -> dict | None:
    """
    Call Gemini AI and return a result dict, or None on failure.
    Import is lazy to avoid crash when google-genai is not installed.
    """
    try:
        from gemini_client import parse_with_gemini

        ai_response = parse_with_gemini(content)
        if ai_response is None:
            return None

        return {
            "has_intent": ai_response["has_intent"],
            "confidence": "high",  # AI verified → treat as high
            "source": "gemini",
            "product_code": ai_response.get("product_code"),
            "color": ai_response.get("color"),
            "size": ai_response.get("size"),
            "quantity": ai_response.get("quantity"),
            "raw": content,
        }

    except EnvironmentError as e:
        logger.warning(f"Gemini not configured: {e}")
        return None
    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        return None


# ── Private helpers ──────────────────────────────────────────


def _no_intent(content: str, source: str = "regex") -> dict:
    """Return a standard 'no purchase intent' result."""
    return {
        "has_intent": False,
        "confidence": None,
        "source": source,
        "product_code": None,
        "color": None,
        "size": None,
        "quantity": None,
        "raw": content,
    }


def _extract_product_code(content: str) -> str | None:
    """Find product codes like A12, SP05, SKU-123."""
    match = re.search(r"\b([A-Za-z]{1,4}[\-]?\d{1,5})\b", content)
    return match.group(1).upper() if match else None


def _extract_color(lower: str) -> str | None:
    """Find a known color in the lowercased comment."""
    for c in KNOWN_COLORS:
        if c in lower:
            return c
    return None


def _extract_size(content: str) -> str | None:
    """Find clothing size (S, M, L, XL, etc.)."""
    match = re.search(
        r"\bsize\s*(\w+)|\b(XXS|XS|XXL|XXXL|XL|S|M|L)\b",
        content,
        re.IGNORECASE,
    )
    if match:
        raw_size = (match.group(1) or match.group(2)).upper()
        if raw_size in KNOWN_SIZES:
            return raw_size
    return None


def _extract_quantity(
    content: str, lower: str, product_code: str | None
) -> int | None:
    """Find purchase quantity from the comment."""
    qty_match = re.search(
        r"(\d+)\s*(cái|chiếc|bộ|đôi|cặp|sp|sản phẩm)", lower
    )
    if qty_match:
        return int(qty_match.group(1))

    all_numbers = re.findall(r"\b(\d+)\b", content)
    if product_code:
        code_numbers = re.findall(r"\d+", product_code)
        remaining = [n for n in all_numbers if n not in code_numbers]
        if remaining:
            return int(remaining[0])
    elif all_numbers:
        return int(all_numbers[-1])

    return None
