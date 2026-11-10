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

from catalog import CatalogProvider, DEFAULT_CATALOG
from intent_policy import apply_decision, guard_comment
from quantity_parser import extract_quantity
from product_codes import find_product_identifiers, is_supported_product_code, mask_product_codes

# --- Backward-compatible catalog aliases ---
KNOWN_COLORS = DEFAULT_CATALOG.known_colors
KNOWN_SIZES = DEFAULT_CATALOG.known_sizes

# Strong keywords = clearly want to buy
# Weak keywords = might be buying, need more signals
# Có cả dạng không dấu ("chot", "dat", "lay") vì khách gõ điện thoại hay bỏ dấu.
STRONG_KEYWORDS = ["chốt", "chot", "mua", "order", "đặt", "dat"]
WEAK_KEYWORDS = ["lấy", "lay", "cho"]

logger = logging.getLogger(__name__)


def parse_purchase_intent(
    content: str,
    use_ai: bool = True,
    *,
    catalog: CatalogProvider | None = None,
) -> dict:
    """
    Extract purchase intent from a comment string.

    Args:
        content: The validated, stripped comment text.
        use_ai: If True, call Gemini AI when regex confidence is low.
                Set to False in tests to avoid real API calls.
        catalog: Optional CatalogProvider for product attributes (colors, sizes).

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
    active_catalog = catalog if catalog is not None else DEFAULT_CATALOG
    known_colors = active_catalog.known_colors
    known_sizes = active_catalog.known_sizes

    guarded = guard_comment(content, known_colors=known_colors)
    if guarded is not None:
        return guarded

    # --- Step 1: Regex tries first (fast, free) ---
    regex_result, quantity_issue = _regex_parse(
        content, known_colors=known_colors, known_sizes=known_sizes
    )

    # No purchase evidence found by the current regex rules.
    if not regex_result["has_intent"]:
        return apply_decision(regex_result)

    # Do not let AI reinterpret a known invalid or ambiguous numeric expression.
    if quantity_issue:
        return apply_decision(regex_result, quantity_issue=quantity_issue)

    # AI must not invent or repair a code outside the supported MVP grammar.
    if regex_result["product_code"] is None:
        return apply_decision(regex_result)

    # Skip AI for confident extraction, but still check completeness.
    if regex_result["confidence"] == "high":
        return apply_decision(regex_result)

    if not use_ai:
        return apply_decision(regex_result)

    logger.info("Low confidence, calling Gemini AI")
    # Will raise AIParsingError if AI fails. We let it bubble up.
    ai_result = _try_gemini(content)
    return _ground_ai_result(ai_result, regex_result)


# ── Regex parser ─────────────────────────────────────────────


def _regex_parse(
    content: str,
    *,
    known_colors: list[str],
    known_sizes: list[str],
) -> tuple[dict, str | None]:
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
    attribute_text = mask_product_codes(content)
    color = _extract_color(attribute_text.lower(), known_colors=known_colors)
    size = _extract_size(attribute_text, known_sizes=known_sizes)
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
        "confidence": "high",  # Intent classification still requires field evidence.
        "source": "gemini",
        "product_code": ai_response.get("product_code"),
        "color": ai_response.get("color"),
        "size": ai_response.get("size"),
        "quantity": ai_response.get("quantity"),
        "raw": content,
    }



def _ground_ai_result(ai_result: dict, evidence: dict) -> dict:
    """Validate AI fields against the existing deterministic comment evidence."""
    result = dict(ai_result)
    result["raw"] = evidence["raw"]

    code = result.get("product_code")
    code = code.strip() if isinstance(code, str) else ""
    result["product_code"] = (
        evidence["product_code"]
        if is_supported_product_code(code) and code.upper() == evidence["product_code"]
        else None
    )

    quantity_issue = None
    quantity = result.get("quantity")
    if type(quantity) is int and quantity > 0:
        if evidence["quantity"] is None:
            result["quantity"] = None
        elif quantity != evidence["quantity"]:
            result["quantity"] = None
            quantity_issue = "invalid_quantity"

    for field in ("color", "size"):
        value, expected = result.get(field), evidence.get(field)
        if isinstance(value, str) and expected is not None:
            normalized = " ".join(unicodedata.normalize("NFC", value).casefold().split())
            if normalized == expected.casefold():
                result[field] = expected
                continue
        result[field] = None

    return apply_decision(result, quantity_issue=quantity_issue)


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
    """Return one complete supported identifier, never a substring."""
    identifiers = find_product_identifiers(content)
    if len(identifiers) == 1 and is_supported_product_code(identifiers[0]):
        return identifiers[0]
    return None


def _extract_color(lower: str, known_colors: list[str]) -> str | None:
    """Find a standalone known color, preferring complete multiword names."""
    text = " ".join(unicodedata.normalize("NFC", lower).casefold().split())
    for c in known_colors:
        if re.search(rf"(?<!\w){re.escape(c)}(?!\w)", text):
            return c
    return None


def _extract_size(content: str, known_sizes: list[str]) -> str | None:
    """Find clothing size (S, M, L, XL, etc.) dynamically based on catalog sizes."""
    if not known_sizes:
        return None
    # Sort longest-first so e.g. 'XXXL' matches before 'XXL', '4XL' before 'XL'
    sorted_sizes = sorted(known_sizes, key=len, reverse=True)
    sizes_pattern = "|".join(re.escape(s) for s in sorted_sizes)
    match = re.search(
        rf"(?:\bsize\s*|(?<!\w))({sizes_pattern})(?!\w)",
        content,
        re.IGNORECASE,
    )
    if match:
        raw_size = match.group(1).upper()
        size_map = {s.upper(): s for s in known_sizes}
        if raw_size in size_map:
            return size_map[raw_size]
    return None
