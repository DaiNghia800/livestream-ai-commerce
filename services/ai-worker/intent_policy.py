"""Conservative language guards and shared business decisions, without I/O.

A purchase candidate is only an extraction candidate. Commerce must still
resolve a unique SKU and validate availability and price before any order.
"""

import re
import unicodedata


# Khách gõ điện thoại hay bỏ dấu ("chot", "khong mua"), nên mỗi từ khoá có
# thêm dạng không dấu. Chỉ thêm dạng ít đụng từ khác: "đừng"→"dung" trùng
# "dùng", "chả"→"cha" trùng "cha", nên hai từ đó không có bản không dấu.
_BUY = r"\b(?:chốt|chot|mua|lấy|lay|đặt|dat|order)\b"
_NEGATION = r"\b(?:không|khong|chẳng|chang|chả|chưa|chua|đừng)\b"
_NEGATED_BUY = re.compile(
    _NEGATION
    + r"(?:\s+(?:muốn|muon|cần|can|định|dinh|có|co|nên|nen|vội|voi|hãy|hay))*\s+"
    + _BUY
)
_QUESTION = re.compile(
    # "hoi" không có bản không dấu: trùng "hơi" ("mua hơi nhiều").
    r"[?？]|\b(?:hỏi|bao nhiêu|bao nhieu|bao giờ|bao gio|khi nào|khi nao"
    r"|thế nào|the nao|được không|duoc khong)\b"
    r"|\b(?:không|khong|chưa|chua|à|hả|chứ)(?:\s+(?:ạ|vậy|nhỉ|anh|chị|shop))*[.!]*$"
)


def _has_alternative_colors(text: str, known_colors: list[str]) -> bool:
    """Find distinct color choices without matching inside product-code tokens."""
    color_pattern = "|".join(re.escape(color) for color in known_colors)
    colors = list(re.finditer(
        rf"(?<![\w-])(?:{color_pattern})(?![\w-])", text
    ))
    for first, second in zip(colors, colors[1:]):
        connector = text[first.end():second.start()]
        if first.group() != second.group() and re.fullmatch(
            r"\s+(?:hoặc|hay)\s+(?:màu\s+)?", connector
        ):
            return True
    return False


def guard_comment(
    content: str, *, known_colors: list[str] | None = None
) -> dict | None:
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

    if reason is None and known_colors:
        # Match the regex parser's weak "cho" signal for this guard only.
        if (has_purchase or re.search(r"\bcho\b", text)) and _has_alternative_colors(
            text, known_colors
        ):
            reason = "ambiguous_color"

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


def apply_decision(intent: dict, quantity_issue: str | None = None) -> dict:
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
        if quantity_issue:
            reasons.append(quantity_issue)
        product_code = result.get("product_code")
        if not isinstance(product_code, str) or not product_code.strip():
            reasons.append("missing_product_code")
        quantity = result.get("quantity")
        if quantity is None and quantity_issue is None:
            reasons.append("missing_quantity")
        elif quantity_issue is None and (type(quantity) is not int or quantity <= 0):
            reasons.append("invalid_quantity")
        if result.get("confidence") != "high" and quantity_issue is None:
            reasons.append("uncertain_intent")
        decision = "needs_clarification" if reasons else "purchase_candidate"
    result["decision"] = decision
    result["reason_codes"] = reasons
    return result


_EMPTY_ITEM = {"product_code": None, "quantity": None, "color": None, "size": None}


def apply_ai_decision(intent: dict) -> dict:
    """Turn an AI reading (kind + items) into the worker's decision.

    The AI decides what the viewer meant; this gate only checks that every
    item is complete enough to become an order line. Nothing is inferred:
    a missing quantity or code is a clarification request, never a guess.
    Legacy single-product fields mirror the first item for older callers
    and the comment.analyzed contract.
    """
    result = dict(intent)
    items = result.get("items")
    if items is None:
        # Kết quả kiểu cũ (một sản phẩm, không có items/kind) vẫn đi qua đây.
        items = [] if not result.get("has_intent") else [{
            "product_code": result.get("product_code"), "quantity": result.get("quantity"),
            "color": result.get("color"), "size": result.get("size"),
        }]
    items = [dict(_EMPTY_ITEM, **i) for i in items if isinstance(i, dict)]
    kind = result.get("kind") or ("purchase" if result.get("has_intent") else "other")

    reasons: list[str] = []
    if kind == "question":
        # Hỏi kèm sản phẩm → cần khách khẳng định; hỏi suông → không phải đơn.
        decision = "needs_clarification" if items else "no_purchase"
        reasons.append("ambiguous_question" if items else "question")
    elif kind == "other" or not result.get("has_intent"):
        decision = "no_purchase"
        reasons.append("no_purchase_intent")
    else:
        if not items:
            reasons.append("missing_product_code")
        for item in items:
            code = item["product_code"]
            if not isinstance(code, str) or not code.strip():
                reasons.append("missing_product_code")
            quantity = item["quantity"]
            if quantity is None:
                reasons.append("missing_quantity")
            elif type(quantity) is not int or quantity <= 0:
                reasons.append("invalid_quantity")
        reasons = list(dict.fromkeys(reasons))
        decision = "needs_clarification" if reasons else "purchase_candidate"

    first = items[0] if items else _EMPTY_ITEM
    result.update(items=items, kind=kind, product_code=first["product_code"],
                  quantity=first["quantity"], color=first["color"], size=first["size"])
    result["has_intent"] = decision != "no_purchase"
    result["decision"] = decision
    result["reason_codes"] = reasons
    return result
