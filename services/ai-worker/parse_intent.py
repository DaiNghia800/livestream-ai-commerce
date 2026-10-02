"""
Parse purchase intent from a livestream comment.

TEMPORARY version using regex.
Will be replaced by Gemini AI later — only the internals of
parse_purchase_intent() will change, the signature stays the same.
"""

import re

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


def parse_purchase_intent(content: str) -> dict:
    """
    Extract purchase intent from a comment string.

    Args:
        content: The validated, stripped comment text.

    Returns:
        A dict with:
          - "has_intent": True if this looks like a purchase comment
          - "confidence": "high" | "low" | None
          - "product_code": str or None
          - "color": str or None
          - "size": str or None
          - "quantity": int or None
          - "raw": the original content (for debugging)

        confidence meanings:
          - "high": regex is confident → safe to create order directly
          - "low": regex found some signals → should verify with AI
          - None: no purchase intent detected
    """
    lower = content.lower()

    # --- Check if the comment looks like a purchase intent ---
    has_strong = any(kw in lower for kw in STRONG_KEYWORDS)
    has_weak = any(kw in lower for kw in WEAK_KEYWORDS)

    if not has_strong and not has_weak:
        return _no_intent(content)

    # --- Extract each field ---
    product_code = _extract_product_code(content)
    color = _extract_color(lower)
    size = _extract_size(content)
    quantity = _extract_quantity(content, lower, product_code)

    # --- Calculate confidence ---
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
        # Weak keyword + no product info = probably not buying
        # e.g. "cho em hỏi giá"
        return _no_intent(content)

    return {
        "has_intent": True,
        "confidence": confidence,
        "product_code": product_code,
        "color": color,
        "size": size,
        "quantity": quantity,
        "raw": content,
    }


# ── Private helpers ──────────────────────────────────────────


def _no_intent(content: str) -> dict:
    """Return a standard 'no purchase intent' result."""
    return {
        "has_intent": False,
        "confidence": None,
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
    # Longest-first matching prevents "xanh" stealing "xanh dương"
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
    # Try explicit pattern first: "2 cái", "3 chiếc", etc.
    qty_match = re.search(
        r"(\d+)\s*(cái|chiếc|bộ|đôi|cặp|sp|sản phẩm)", lower
    )
    if qty_match:
        return int(qty_match.group(1))

    # Fallback: standalone numbers not part of product code
    all_numbers = re.findall(r"\b(\d+)\b", content)
    if product_code:
        code_numbers = re.findall(r"\d+", product_code)
        remaining = [n for n in all_numbers if n not in code_numbers]
        if remaining:
            return int(remaining[0])
    elif all_numbers:
        return int(all_numbers[-1])

    return None
