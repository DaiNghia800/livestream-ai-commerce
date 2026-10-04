"""Conservative language guards and shared business decisions, without I/O.

A purchase candidate is only an extraction candidate. Commerce must still
resolve a unique SKU and validate availability and price before any order.
"""

import re
import unicodedata


_BUY = r"\b(?:chốt|mua|lấy|đặt|order)\b"
_NEGATION = r"\b(?:không|chẳng|chả|chưa|đừng)\b"
_NEGATED_BUY = re.compile(
    _NEGATION + r"(?:\s+(?:muốn|cần|định|có|nên|vội|hãy))*\s+" + _BUY
)
_QUESTION = re.compile(
    r"[?？]|\b(?:hỏi|bao nhiêu|bao giờ|khi nào|thế nào|được không)\b"
    r"|\b(?:không|chưa|à|hả|chứ)(?:\s+(?:ạ|vậy|nhỉ|anh|chị|shop))*[.!]*$"
)


def guard_comment(content: str) -> dict | None:
    """Short-circuit known risky language before either regex or Gemini.

    These rules are deliberately bounded; they are not a Vietnamese semantic
    parser. Mixed clauses are clarification requests, never partial purchases.
    """
    text = " ".join(unicodedata.normalize("NFC", content).casefold().split())
    purchases = list(re.finditer(_BUY, text))
    has_purchase = bool(purchases) or bool(re.search(
        r"\bcho\s+(?:em|mình|tôi|anh|chị)\s+(?!hỏi\b)", text
    ))
    reason = None
    decision = "needs_clarification"
    if _QUESTION.search(text):
        reason = "ambiguous_question" if has_purchase else "question"
        if not has_purchase:
            decision = "no_purchase"
    elif re.search(_NEGATION, text):
        negated = list(_NEGATED_BUY.finditer(text))
        negations = list(re.finditer(_NEGATION, text))
        # Only one simple, directly negated action is considered unambiguous.
        if len(purchases) == len(negated) == len(negations) == 1:
            reason = "explicit_negation"
            decision = "no_purchase"
        elif has_purchase:
            reason = "ambiguous_negation"
    elif has_purchase and re.search(r"\b(?:nếu|miễn là)\b", text):
        reason = "conditional_purchase"

    if reason is None and has_purchase:
        codes = set(re.findall(r"\b[a-z]{1,4}-?\d{1,5}\b", text))
        if len(codes) > 1:
            reason = "multiple_products"

    if reason is None:
        return None
    return {
        "has_intent": decision != "no_purchase",
        "confidence": "low" if decision == "needs_clarification" else None,
        "source": "regex",
        "product_code": None,
        "color": None,
        "size": None,
        "quantity": None,
        "raw": content,
        "decision": decision,
        "reason_codes": [reason],
    }


def apply_decision(intent: dict) -> dict:
    """Apply the same completeness gate to regex and AI extraction results.

    Keep legacy extraction fields for callers, but never use has_intent or
    confidence alone as permission to create an order. No quantity is inferred.
    """
    result = dict(intent)
    reasons = []
    if not result["has_intent"]:
        decision = "no_purchase"
        reasons.append("no_purchase_intent")
    else:
        product_code = result.get("product_code")
        if not isinstance(product_code, str) or not product_code.strip():
            reasons.append("missing_product_code")
        quantity = result.get("quantity")
        if quantity is None:
            reasons.append("missing_quantity")
        elif type(quantity) is not int or quantity <= 0:
            reasons.append("invalid_quantity")
        if result.get("confidence") != "high":
            reasons.append("uncertain_intent")
        decision = "needs_clarification" if reasons else "purchase_candidate"
    result["decision"] = decision
    result["reason_codes"] = reasons
    return result
