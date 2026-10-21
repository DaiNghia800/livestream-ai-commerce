"""Extract quantities only from explicit, unambiguous numeric evidence."""

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class QuantityResult:
    """Keep a quantity separate from a reason that requires clarification."""

    value: int | None = None
    issue: str | None = None


_NUMBER = r"[-+−]?\s*(?:\d+(?:[.,/]\d+)*|[.,]\d+)(?:[eE][+-]?\d+)?"
_UNITS = re.compile(r"\s*(?:cái|chiếc|bộ|đôi|cặp|sản\s+phẩm|sp)\b")
_LABEL = re.compile(r"\b(?:số\s+lượng|sl)\s*[:=]?\s*$")
_OTHER_LABEL = re.compile(
    r"\b(?:giá|tiền|tổng|ship|phí|size|cỡ|lúc|sđt)\s*[:=]?\s*$"
)
_CURRENCY = re.compile(r"\s*(?:k|nghìn|ngàn|triệu|đồng|đ|vnd|vnđ|usd)\b|\s*[₫$%]")
_PRODUCT_TOKEN = re.compile(r"\b[a-z]+(?:-[a-z]+)*-?\d+(?:-[a-z0-9]+)*\b")


def _validate_number(raw: str) -> QuantityResult:
    """Reject fractions/decimals rather than truncating or rounding them."""
    number = "".join(raw.split()).replace("−", "-")
    if not re.fullmatch(r"[+-]?\d+", number):
        return QuantityResult(issue="invalid_quantity")
    # Bound conversion work for malformed, extremely long numeric input.
    if len(number.lstrip("+-")) > 100:
        return QuantityResult(issue="invalid_quantity")
    value = int(number)
    return QuantityResult(value, "invalid_quantity" if value <= 0 else None)


def extract_quantity(content: str, product_code: str | None) -> QuantityResult:
    """Accept a unit, a quantity label, or a complete '<buy> <code> <count>'.

    Product-code spans are masked, not numbers with matching values. This keeps
    the count in 'Chot A12 12' while excluding the digits inside 'A12'. Other
    numbers are never used as an arbitrary first/last-number fallback.
    """
    text = unicodedata.normalize("NFC", content).casefold()
    masked = _PRODUCT_TOKEN.sub(lambda match: " " * len(match.group()), text)
    numbers = list(re.finditer(r"(?<![\w.,/])" + _NUMBER, masked))
    candidates = []
    unrelated = []
    for match in numbers:
        before, after = masked[:match.start()], masked[match.end():]
        if _OTHER_LABEL.search(before) or _CURRENCY.match(after):
            continue
        # A search match must not start or end inside a numeric expression.
        if re.search(r"[-+−]\s*$", before) or re.match(
            r"[-+−/]|[.,](?=[\d.,/eE+−-])", after
        ):
            return QuantityResult(issue="invalid_quantity")
        if _UNITS.match(after):
            candidates.append(match.group())
        elif _LABEL.search(before):
            # A label cannot legitimize a truncated token such as '2abc'.
            if re.match(r"[\w/+-]", after):
                return QuantityResult(issue="invalid_quantity")
            candidates.append(match.group())
        else:
            unrelated.append(match.group())

    if len(candidates) > 1:
        return QuantityResult(issue="ambiguous_quantity")
    if candidates:
        quantity = _validate_number(candidates[0])
        if quantity.issue:
            return quantity
        if unrelated:
            return QuantityResult(issue="ambiguous_quantity")
        return quantity

    if product_code:
        compact = re.fullmatch(
            r"\s*(?:chốt|mua|order|đặt|lấy)\s+" + re.escape(product_code.casefold())
            + r"\s+(?P<quantity>" + _NUMBER + r")\s*[.!]?\s*", text
        )
        if compact:
            return _validate_number(compact.group("quantity"))

    # Existing AI routing remains available when no numeric evidence exists.
    return QuantityResult(issue="missing_quantity" if numbers else None)
