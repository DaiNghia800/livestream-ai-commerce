"""
Parse purchase intent from a livestream comment.

Strategy:
  With an AI key (OpenAI or Gemini) the AI is the decision maker:
    1. Regex fast path only for a clearly formed order (buy word + code +
       one more field, no ambiguity) — no network, no cost
    2. Anything else that could be a purchase (buy word, a number, a code,
       or ambiguous purchase language) goes to the AI together with the
       livestream's product list; the AI returns kind + items
    3. Pure chatter (no number, no buy word) is dropped without the AI
  Without an AI key the legacy regex-only path with its conservative guards
  applies, and a low-confidence comment fails with a configuration error.
"""

import re
import logging
import os
import unicodedata

import dotenv

from catalogue import fetch_catalogue
from intent_policy import apply_ai_decision, apply_decision, guard_comment
from quantity_parser import extract_quantity

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
# Có cả dạng không dấu ("chot", "dat", "lay") vì khách gõ điện thoại hay bỏ dấu.
STRONG_KEYWORDS = ["chốt", "chot", "mua", "order", "đặt", "dat"]
WEAK_KEYWORDS = ["lấy", "lay", "cho"]

logger = logging.getLogger(__name__)


def parse_purchase_intent(
    content: str, use_ai: bool = True, session_id: str | None = None
) -> dict:
    """
    Extract purchase intent from a comment string.

    Args:
        content: The validated, stripped comment text.
        use_ai: If False, never call an AI (tests, offline runs).
        session_id: Livestream id, used to give the AI the product list.

    Returns:
        A dict with:
          - "has_intent": True if this looks like a purchase comment
          - "confidence": "high" | "low" | None
          - "source": "regex" | "gemini" | "openai" — who made the final decision
          - "items": [{product_code, quantity, color, size}] (AI path)
          - "product_code", "color", "size", "quantity": first item (legacy)
          - "raw": the original content (for debugging)
          - "decision": no_purchase | needs_clarification | purchase_candidate
          - "reason_codes": machine-readable reasons for the decision

        A purchase_candidate still requires Commerce SKU validation.
    """
    regex_result, quantity_issue = _regex_parse(content)
    if use_ai and ai_available():
        return _parse_ai_first(content, regex_result, quantity_issue, session_id)
    return _parse_regex_only(content, regex_result, quantity_issue, use_ai)


def _parse_ai_first(
    content: str, regex_result: dict, quantity_issue: str | None, session_id: str | None
) -> dict:
    """AI decides everything the regex fast path cannot settle."""
    guarded = guard_comment(content, known_colors=KNOWN_COLORS)

    # Đường nhanh: câu chuẩn, không mập mờ → không tốn lượt AI.
    if (guarded is None and regex_result["has_intent"]
            and regex_result["confidence"] == "high" and not quantity_issue):
        return apply_decision(regex_result)

    # Tán gẫu thuần (không số, không từ mua, không dấu hiệu mua) → bỏ qua.
    if not _worth_asking(content, regex_result, guarded):
        return apply_decision(_no_intent(content, source="regex"))

    catalogue = fetch_catalogue(session_id) if session_id else []
    return apply_ai_decision(_try_ai(content, catalogue))


def _worth_asking(content: str, regex_result: dict, guarded: dict | None) -> bool:
    """Cheap filter before paying for an AI call."""
    return bool(
        regex_result["has_intent"]      # có từ mua (mạnh hoặc yếu)
        or guarded is not None          # có ngôn ngữ mua nhưng mập mờ
        or re.search(r"\d", content)    # có con số: số lượng hoặc mã
    )


def _parse_regex_only(
    content: str, regex_result: dict, quantity_issue: str | None, use_ai: bool
) -> dict:
    """Legacy path: conservative guards, regex, and no AI available."""
    guarded = guard_comment(content, known_colors=KNOWN_COLORS)
    if guarded is not None:
        return guarded

    # No purchase evidence found by the current regex rules.
    if not regex_result["has_intent"]:
        return apply_decision(regex_result)

    # Do not let AI reinterpret a known invalid or ambiguous numeric expression.
    if quantity_issue:
        return apply_decision(regex_result, quantity_issue=quantity_issue)

    # Skip AI for confident extraction, but still check completeness.
    if regex_result["confidence"] == "high":
        return apply_decision(regex_result)

    if not use_ai:
        return apply_decision(regex_result)

    # Không có key: _try_ai ném AIParsingError cấu hình, để worker giữ message.
    return apply_decision(_try_ai(content))


# ── Regex parser ─────────────────────────────────────────────


def _regex_parse(content: str) -> tuple[dict, str | None]:
    """Pure regex-based parsing. No network, no side effects."""
    lower = content.lower()

    # NFC keeps decomposed Vietnamese letters intact for Unicode word boundaries.
    keyword_text = unicodedata.normalize("NFC", lower)
    has_strong = any(
        re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", keyword_text)
        for kw in STRONG_KEYWORDS
    )
    has_weak = any(
        re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", keyword_text)
        for kw in WEAK_KEYWORDS
    )

    if not has_strong and not has_weak:
        return _no_intent(content, source="regex"), None

    product_code = _extract_product_code(content)
    color = _extract_color(lower)
    size = _extract_size(content)
    quantity_result = extract_quantity(content, product_code)
    quantity = quantity_result.value

    fields_found = sum([
        product_code is not None,
        color is not None,
        size is not None,
        quantity is not None,
    ])

    # Chỉ "chắc" khi có từ mua, nhận được MÃ và thêm một trường nữa. Thiếu
    # mã thì số lượng + size vẫn không ra đơn được, phải để AI đọc (mã dài
    # kiểu SHIPDEMO-mve51bb3-M regex không bắt được).
    if has_strong and product_code is not None and fields_found >= 2:
        confidence = "high"
    elif has_strong or fields_found >= 1:
        confidence = "low"
    else:
        return _no_intent(content, source="regex"), None

    return {
        "has_intent": True,
        "confidence": confidence,
        "source": "regex",
        "product_code": product_code,
        "color": color,
        "size": size,
        "quantity": quantity,
        "raw": content,
    }, quantity_result.issue


# ── AI provider selection ────────────────────────────────────


def ai_provider() -> str:
    """Pick the AI provider: OpenAI when its key is configured, Gemini otherwise.

    Returns "openai" or "gemini".
    """
    # Nạp .env gốc trước khi đọc, vì hàm này chạy trước khi client nào được
    # import (các client mới gọi load_dotenv khi import).
    dotenv.load_dotenv()
    return "openai" if os.environ.get("OPENAI_API_KEY", "").strip() else "gemini"


def ai_available() -> bool:
    """True when an AI key (OpenAI or Gemini) is configured."""
    dotenv.load_dotenv()
    return bool(os.environ.get("OPENAI_API_KEY", "").strip() or os.environ.get("GEMINI_API_KEY", "").strip())


def _try_ai(content: str, catalogue: list[dict] | None = None) -> dict:
    """Route a comment to the configured AI provider."""
    provider = ai_provider()
    logger.info(f"Calling {provider} for: {content}")
    if catalogue is None:
        # Giữ chữ ký một tham số cho đường cũ và test cũ.
        return _try_openai(content) if provider == "openai" else _try_gemini(content)
    return _try_openai(content, catalogue) if provider == "openai" else _try_gemini(content, catalogue)


# ── OpenAI caller ────────────────────────────────────────────


def _try_openai(content: str, catalogue: list[dict] | None = None) -> dict:
    """Call OpenAI and return a result dict in the same shape as _try_gemini.

    Import is lazy so a Gemini-only setup never needs the openai package.
    Raises AIParsingError on failure.
    """
    from openai_client import parse_with_openai

    ai_response = parse_with_openai(content) if catalogue is None else parse_with_openai(content, catalogue)
    return _ai_result(ai_response, "openai", content)


def _ai_result(ai_response: dict, source: str, content: str) -> dict:
    """Shape a provider answer into the worker's result dict."""
    return {
        "has_intent": ai_response["has_intent"],
        "confidence": "high",  # AI verified → treat as high
        "source": source,
        "kind": ai_response.get("kind"),
        "items": ai_response.get("items"),
        "product_code": ai_response.get("product_code"),
        "color": ai_response.get("color"),
        "size": ai_response.get("size"),
        "quantity": ai_response.get("quantity"),
        "raw": content,
    }


# ── Gemini AI caller ─────────────────────────────────────────


def _try_gemini(content: str, catalogue: list[dict] | None = None) -> dict:
    """
    Call Gemini AI and return a result dict.
    Import is lazy to avoid crash when google-genai is not installed.
    Raises AIParsingError on failure.
    """
    from gemini_client import parse_with_gemini

    ai_response = parse_with_gemini(content) if catalogue is None else parse_with_gemini(content, catalogue)
    return _ai_result(ai_response, "gemini", content)


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
    """Find a standalone known color, preferring complete multiword names."""
    text = " ".join(unicodedata.normalize("NFC", lower).casefold().split())
    for c in KNOWN_COLORS:
        if re.search(rf"(?<!\w){re.escape(c)}(?!\w)", text):
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
