"""
Parse purchase intent from a livestream comment.

Strategy (hybrid):
  0. Guard negation, questions and ambiguous purchase language
  1. Regex tries first — fast, free, no network
  2. If regex confidence is "high" → apply the business decision gate
  3. If regex confidence is "low"  → call Gemini AI to verify
  4. If Gemini fails              → propagate the technical failure
  5. If no keywords found         → skip (no intent)
"""

import re
import logging
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
STRONG_KEYWORDS = ["chốt", "mua", "order", "đặt"]
WEAK_KEYWORDS = ["lấy", "cho"]

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
          - "source": "regex" | "gemini" — who made the final decision
          - "product_code": str or None
          - "color": str or None
          - "size": str or None
          - "quantity": int or None
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

    # --- Step 2: Regex confidence is "low" → ask Gemini AI ---
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

    if has_strong and fields_found >= 2:
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


# ── Gemini AI caller ─────────────────────────────────────────


def _try_gemini(content: str) -> dict:
    """
    Call Gemini AI and return a result dict.
    Import is lazy to avoid crash when google-genai is not installed.
    Raises AIParsingError on failure.
    """
    from gemini_client import parse_with_gemini

    ai_response = parse_with_gemini(content)

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
